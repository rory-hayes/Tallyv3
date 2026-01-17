/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tally/db", "@tally/storage"],
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    typedRoutes: true
  }
};

module.exports = nextConfig;
