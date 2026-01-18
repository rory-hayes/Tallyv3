// This file must be imported BEFORE any Prisma Client imports
// It sets up the Prisma engine path for Vercel/serverless environments

if (process.env.NODE_ENV === "production" && !process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  const path = require("path");
  const fs = require("fs");

  // Try to find the engine in common Vercel/serverless locations
  const possiblePaths = [
    // Vercel's /var/task paths (absolute) - checked first as they're most reliable
    "/var/task/apps/web/.next/server/libquery_engine-rhel-openssl-3.0.x.so.node",
    "/var/task/apps/web/.next/server/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
    "/var/task/.next/server/libquery_engine-rhel-openssl-3.0.x.so.node",
    "/var/task/.next/server/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
    // .prisma-engines directory (copied in prebuild, included in build)
    "/var/task/apps/web/.prisma-engines/libquery_engine-rhel-openssl-3.0.x.so.node",
    "/var/task/.prisma-engines/libquery_engine-rhel-openssl-3.0.x.so.node",
    // Standard .next/server location (relative to cwd)
    path.join(process.cwd(), ".next", "server", "libquery_engine-rhel-openssl-3.0.x.so.node"),
    path.join(process.cwd(), ".next", "server", ".prisma", "client", "libquery_engine-rhel-openssl-3.0.x.so.node"),
    path.join(process.cwd(), ".prisma-engines", "libquery_engine-rhel-openssl-3.0.x.so.node"),
    // Also check in node_modules (for cases where it's there)
    "/var/task/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node",
  ];

  for (const enginePath of possiblePaths) {
    try {
      if (fs.existsSync(enginePath)) {
        process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath;
        // Log for debugging (will be visible in Vercel logs)
        console.log(`[Prisma Setup] Found engine at: ${enginePath}`);
        break;
      }
    } catch (e) {
      // Continue searching
    }
  }

  if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    console.warn("[Prisma Setup] Could not find Prisma engine in any expected location");
    console.warn("[Prisma Setup] Searched paths:", possiblePaths);
  }
}
