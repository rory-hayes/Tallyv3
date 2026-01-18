import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

// Set up Prisma engine path for Vercel/serverless environments
// The engine is copied to .next/server during build by copy-prisma-engine.js
if (process.env.NODE_ENV === "production" && !process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  // Try to find the engine in common Vercel/serverless locations
  const path = require("path");
  const fs = require("fs");
  
  const possiblePaths = [
    // Standard .next/server location (relative to cwd)
    path.join(process.cwd(), ".next", "server", "libquery_engine-rhel-openssl-3.0.x.so.node"),
    path.join(process.cwd(), ".next", "server", ".prisma", "client", "libquery_engine-rhel-openssl-3.0.x.so.node"),
    // Vercel's /var/task paths (absolute)
    "/var/task/apps/web/.next/server/libquery_engine-rhel-openssl-3.0.x.so.node",
    "/var/task/apps/web/.next/server/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
    "/var/task/.next/server/libquery_engine-rhel-openssl-3.0.x.so.node",
    "/var/task/.next/server/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
  ];

  for (const enginePath of possiblePaths) {
    try {
      if (fs.existsSync(enginePath)) {
        process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath;
        break;
      }
    } catch (e) {
      // Continue searching
    }
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: []
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
