const path = require("path");

const prismaClientDir = path.join(
  path.dirname(require.resolve("@prisma/client/package.json")),
  "../.prisma/client"
);
const prismaClientRelative = path
  .relative(__dirname, prismaClientDir)
  .split(path.sep)
  .join("/");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tally/db", "@tally/storage"],
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ["@prisma/client"]
  },
  outputFileTracingIncludes: {
    "/**/*": [`${prismaClientRelative}/**`]
  }
};

module.exports = nextConfig;
