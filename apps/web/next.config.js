/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tally/db", "@tally/storage"],
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ["@prisma/client"]
  }
};

module.exports = nextConfig;
