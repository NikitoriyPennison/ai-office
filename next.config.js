/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  output: "standalone",
  serverExternalPackages: ["pixi.js"],
  compress: true,
};

module.exports = nextConfig;
