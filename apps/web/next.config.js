const path = require("path");

const repoRoot = path.join(__dirname, "../..");
const prismaClientPkg = path.dirname(require.resolve("@prisma/client/package.json"));
const prismaClientDir = path.join(prismaClientPkg, "../.prisma/client");
const prismaClientRelative = path
  .relative(repoRoot, prismaClientDir)
  .split(path.sep)
  .join("/");
const prismaPkgRelative = path
  .relative(repoRoot, prismaClientPkg)
  .split(path.sep)
  .join("/");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tally/db", "@tally/storage"],
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ["@prisma/client"]
  },
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/**/*": [
      `${prismaClientRelative}/**`,
      `${prismaPkgRelative}/**`,
      // Include Prisma engine from .prisma-engines (copied in prebuild)
      "apps/web/.prisma-engines/libquery_engine-*.so.node"
    ]
  }
};

module.exports = nextConfig;
