/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@e2b/code-interpreter', 'e2b'],
  },
};

module.exports = nextConfig;
