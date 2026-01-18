// CRITICAL: Set up Prisma engine path BEFORE importing PrismaClient
// This must run at module load time, before PrismaClient is instantiated
if (process.env.NODE_ENV === "production" && !process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  try {
    const path = require("path");
    const fs = require("fs");

    // Try to resolve @prisma/client to find the node_modules location
    // Note: require.resolve may return a webpack module ID (number) after bundling,
    // so we need to validate it's actually a string path
    let prismaClientPath: string | null = null;
    try {
      const resolved = require.resolve("@prisma/client/package.json");
      // Validate it's actually a string path, not a webpack module ID (number)
      // After webpack bundling, require.resolve can return a number module ID
      if (typeof resolved === "string" && (resolved.includes("@prisma") || resolved.includes("node_modules") || resolved.includes("/") || resolved.includes("\\"))) {
        prismaClientPath = resolved;
      }
    } catch (e) {
      // Continue with other paths
    }

    // Build list of possible paths, checking node_modules FIRST (most reliable on Vercel)
    const possiblePaths: string[] = [];

    // 1. node_modules/.prisma/client location (Prisma checks this first, Vercel includes it)
    if (prismaClientPath && typeof prismaClientPath === "string") {
      try {
        const prismaClientDir = path.dirname(prismaClientPath);
        if (typeof prismaClientDir === "string") {
          const nodeModulesPrisma = path.join(prismaClientDir, ".prisma", "client", "libquery_engine-rhel-openssl-3.0.x.so.node");
          possiblePaths.push(nodeModulesPrisma);
          
          // Also check parent .prisma/client
          const parentDir = path.dirname(prismaClientDir);
          if (typeof parentDir === "string") {
            const parentPrisma = path.join(parentDir, ".prisma", "client", "libquery_engine-rhel-openssl-3.0.x.so.node");
            possiblePaths.push(parentPrisma);
          }
        }
      } catch (e) {
        // Skip if path operations fail
      }
    }

    // 2. Vercel's /var/task node_modules paths (absolute)
    possiblePaths.push("/var/task/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node");
    
    // 3. Vercel's /var/task .next/server paths (absolute)
    possiblePaths.push(
      "/var/task/apps/web/.next/server/libquery_engine-rhel-openssl-3.0.x.so.node",
      "/var/task/apps/web/.next/server/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
      "/var/task/.next/server/libquery_engine-rhel-openssl-3.0.x.so.node",
      "/var/task/.next/server/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node"
    );

    // 4. .prisma-engines directory
    possiblePaths.push(
      "/var/task/apps/web/.prisma-engines/libquery_engine-rhel-openssl-3.0.x.so.node",
      "/var/task/.prisma-engines/libquery_engine-rhel-openssl-3.0.x.so.node"
    );

    // 5. Relative paths from cwd
    possiblePaths.push(
      path.join(process.cwd(), ".next", "server", "libquery_engine-rhel-openssl-3.0.x.so.node"),
      path.join(process.cwd(), ".next", "server", ".prisma", "client", "libquery_engine-rhel-openssl-3.0.x.so.node"),
      path.join(process.cwd(), ".prisma-engines", "libquery_engine-rhel-openssl-3.0.x.so.node")
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
