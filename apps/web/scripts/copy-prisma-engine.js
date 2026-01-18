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

function findPnpmPrismaClientDir(rootDir) {
  const pnpmDir = path.join(rootDir, "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmDir)) {
    return null;
  }
  const entries = fs.readdirSync(pnpmDir);
  for (const entry of entries) {
    if (!entry.startsWith("@prisma+client@")) continue;
    const prismaDir = path.join(pnpmDir, entry, "node_modules", ".prisma", "client");
    if (fs.existsSync(prismaDir)) {
      return prismaDir;
    }
  }
  return null;
}

const webDir = process.cwd();
const rootDir = path.resolve(webDir, "..", "..");

// Build list of potential locations to search
const searchPaths = [];

// 1. Local node_modules/.prisma/client
searchPaths.push(path.join(webDir, "node_modules", ".prisma", "client"));

// 2. Root node_modules/.prisma/client
searchPaths.push(path.join(rootDir, "node_modules", ".prisma", "client"));

// 3. pnpm store locations (for Vercel)
searchPaths.push(path.join(rootDir, "node_modules", ".pnpm"));

// 4. Also search in packages/db/node_modules if it exists
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

const engineFile = path.basename(enginePath);

// Determine if we're in prebuild or postbuild
const nextServerAppExists = fs.existsSync(path.join(webDir, ".next", "server", "app"));

// Copy destinations
const destinations = [];

// CRITICAL: Copy into pnpm @prisma+client .prisma/client directory
const pnpmPrismaClientDir = findPnpmPrismaClientDir(rootDir);
if (pnpmPrismaClientDir) {
  destinations.push(path.join(pnpmPrismaClientDir, engineFile));
  console.log(`Will copy to pnpm prisma client dir: ${pnpmPrismaClientDir}`);
} else {
  console.warn("Could not locate pnpm @prisma+client .prisma/client directory");
}

if (nextServerAppExists) {
  destinations.push(
    path.join(webDir, ".next", "server", engineFile),
    path.join(webDir, ".next", "server", ".prisma", "client", engineFile)
  );
  console.log("Running in postbuild mode - also copying to .next/server/");
} else {
  const prebuildDir = path.join(webDir, ".prisma-engines");
  fs.mkdirSync(prebuildDir, { recursive: true });
  destinations.push(path.join(prebuildDir, engineFile));
  console.log("Running in prebuild mode - also copying to .prisma-engines/");
}

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
