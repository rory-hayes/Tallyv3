const fs = require("fs");
const path = require("path");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      out.push(...walk(p));
    } else {
      out.push(p);
    }
  }
  return out;
}

function findEngine(startDir) {
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

const nodeModulesPrisma = path.join(webDir, "node_modules", ".prisma", "client");
const repoNodeModulesPrisma = path.join(rootDir, "node_modules", ".prisma", "client");
const pnpmNodeModulesPrisma = path.join(rootDir, "node_modules", ".pnpm");

const destDir = path.join(webDir, ".next", "server");

const enginePath =
  (fs.existsSync(nodeModulesPrisma) && findEngine(nodeModulesPrisma)) ||
  (fs.existsSync(repoNodeModulesPrisma) && findEngine(repoNodeModulesPrisma)) ||
  (fs.existsSync(pnpmNodeModulesPrisma) && findEngine(pnpmNodeModulesPrisma));

if (!enginePath) {
  console.error("Could not find Prisma query engine under .prisma/client");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const destPath = path.join(destDir, path.basename(enginePath));
fs.copyFileSync(enginePath, destPath);

console.log(`Copied Prisma engine:\n- from: ${enginePath}\n- to:   ${destPath}`);
