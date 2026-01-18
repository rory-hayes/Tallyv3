// CRITICAL: Set up Prisma engine path BEFORE importing PrismaClient
// This must run at module load time, before PrismaClient is instantiated
if (process.env.NODE_ENV === "production" && !process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  try {
    const path = require("path");
    const fs = require("fs");

    const engineFile = "libquery_engine-rhel-openssl-3.0.x.so.node";
    const possiblePaths: string[] = [];

    const addPnpmClientPaths = (baseDir: string) => {
      try {
        if (!fs.existsSync(baseDir)) return;
        const entries = fs.readdirSync(baseDir);
        for (const entry of entries) {
          if (!entry.startsWith("@prisma+client@")) continue;
          const candidate = path.join(baseDir, entry, "node_modules", ".prisma", "client", engineFile);
          possiblePaths.push(candidate);
        }
      } catch (e) {
        // ignore
      }
    };

    // 1. pnpm locations (most reliable on Vercel)
    addPnpmClientPaths("/var/task/node_modules/.pnpm");
    addPnpmClientPaths("/var/task/apps/web/node_modules/.pnpm");
    addPnpmClientPaths(path.join(process.cwd(), "node_modules", ".pnpm"));
    addPnpmClientPaths(path.join(process.cwd(), "..", "node_modules", ".pnpm"));
    
    // 2. Vercel's /var/task .next/server paths (absolute)
    possiblePaths.push(
      "/var/task/apps/web/.next/server/" + engineFile,
      "/var/task/apps/web/.next/server/.prisma/client/" + engineFile,
      "/var/task/.next/server/" + engineFile,
      "/var/task/.next/server/.prisma/client/" + engineFile
    );

    // 3. .prisma-engines directory
    possiblePaths.push(
      "/var/task/apps/web/.prisma-engines/" + engineFile,
      "/var/task/.prisma-engines/" + engineFile
    );

    // 4. Relative paths from cwd
    possiblePaths.push(
      path.join(process.cwd(), ".next", "server", engineFile),
      path.join(process.cwd(), ".next", "server", ".prisma", "client", engineFile),
      path.join(process.cwd(), ".prisma-engines", engineFile)
    );

    // Search for the engine
    for (const enginePath of possiblePaths) {
      try {
        if (fs.existsSync(enginePath)) {
          process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath;
          console.log(`[Prisma Setup] ✓ Found engine at: ${enginePath}`);
          break;
        }
      } catch (e) {
        // Continue searching
      }
    }

    if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
      console.warn("[Prisma Setup] ⚠ Could not find Prisma engine in any expected location");
      console.warn("[Prisma Setup] Searched paths:", possiblePaths.slice(0, 5), "... (and more)");
    }
  } catch (error) {
    console.error("[Prisma Setup] Error during engine setup:", error);
  }
}

import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: []
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
