const fs = require("fs");
const path = require("path");

function walk(dir) {
  const out = [];
  try {
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) {
          out.push(...walk(p));
        } else {
          out.push(p);
        }
      } catch (e) {
        // Skip files we can't access
      }
    }
  } catch (e) {
    // Skip directories we can't access
  }
  return out;
}

function findEngine(startDir) {
  if (!fs.existsSync(startDir)) {
    return null;
  }
  const candidates = walk(startDir).filter((p) =>
    /libquery_engine-.*\.so\.node$/.test(p)
  );
  if (candidates.length === 0) {
    return null;
  }
  const preferred = candidates.find((p) => p.includes("rhel-openssl-3.0.x"));
  return preferred || candidates[0];
}

const webDir = process.cwd();
const rootDir = path.resolve(webDir, "..", "..");

// Try to resolve @prisma/client package location
let prismaClientPath = null;
try {
  prismaClientPath = require.resolve("@prisma/client/package.json");
} catch (e) {
  // Will try other methods
}

// Build list of potential locations to search
const searchPaths = [];

// 1. Local node_modules/.prisma/client
searchPaths.push(path.join(webDir, "node_modules", ".prisma", "client"));

// 2. Root node_modules/.prisma/client
searchPaths.push(path.join(rootDir, "node_modules", ".prisma", "client"));

// 3. If we found @prisma/client, check its .prisma/client
if (prismaClientPath) {
  const prismaClientDir = path.dirname(prismaClientPath);
  searchPaths.push(path.join(prismaClientDir, ".prisma", "client"));
  // Also check parent directory
  searchPaths.push(path.join(path.dirname(prismaClientDir), ".prisma", "client"));
}

// 4. pnpm store locations (for Vercel)
searchPaths.push(path.join(rootDir, "node_modules", ".pnpm"));
if (prismaClientPath) {
  // Look for pnpm structure like .pnpm/@prisma+client@...
  const prismaClientDir = path.dirname(prismaClientPath);
  const pnpmMatch = prismaClientDir.match(/(.*\/\.pnpm\/[^\/]+)/);
  if (pnpmMatch) {
    searchPaths.push(pnpmMatch[1]);
  }
}

// 5. Also search in packages/db/node_modules if it exists
searchPaths.push(path.join(rootDir, "packages", "db", "node_modules", ".prisma", "client"));

// Find the engine
let enginePath = null;
for (const searchPath of searchPaths) {
  const found = findEngine(searchPath);
  if (found) {
    enginePath = found;
    break;
  }
}

if (!enginePath) {
  console.error("Could not find Prisma query engine. Searched in:");
  searchPaths.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}

// Determine if we're in prebuild or postbuild
// Check if .next/server exists and has been populated by Next.js (has app directory)
const nextServerAppExists = fs.existsSync(path.join(webDir, ".next", "server", "app"));

// Copy to multiple locations where Prisma might look
const destinations = [];

if (nextServerAppExists) {
  // In postbuild, .next/server exists and has been built by Next.js
  // Copy to .next/server locations
  destinations.push(
    path.join(webDir, ".next", "server", path.basename(enginePath)),
    path.join(webDir, ".next", "server", ".prisma", "client", path.basename(enginePath))
  );
  console.log("Running in postbuild mode - copying engine to .next/server/");
} else {
  // In prebuild, .next doesn't exist or hasn't been built yet
  // Copy to .prisma-engines directory (won't be wiped by Next.js build)
  const prebuildDir = path.join(webDir, ".prisma-engines");
  fs.mkdirSync(prebuildDir, { recursive: true });
  destinations.push(path.join(prebuildDir, path.basename(enginePath)));
  console.log("Running in prebuild mode - copying engine to .prisma-engines/");
}

// Also try to copy to the node_modules location Prisma checks (if it exists)
if (prismaClientPath) {
  const prismaClientDir = path.dirname(prismaClientPath);
  const prismaClientEngineDir = path.join(prismaClientDir, ".prisma", "client");
  if (fs.existsSync(prismaClientEngineDir)) {
    destinations.push(path.join(prismaClientEngineDir, path.basename(enginePath)));
  }
  
  // Also check parent .prisma/client
  const parentPrismaDir = path.join(path.dirname(prismaClientDir), ".prisma", "client");
  if (fs.existsSync(parentPrismaDir)) {
    destinations.push(path.join(parentPrismaDir, path.basename(enginePath)));
  }
}

// Copy to all destinations
for (const destPath of destinations) {
  try {
    const destDir = path.dirname(destPath);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(enginePath, destPath);
    console.log(`✓ Copied to: ${destPath}`);
  } catch (error) {
    console.warn(`⚠ Failed to copy to ${destPath}:`, error.message);
  }
}

console.log(`\nPrisma engine setup complete. Source: ${enginePath}`);
