/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_SHORE_SENTINEL_BASE_PATH || '/shore-sentinel';

const nextConfig = {
  output: 'standalone',
  basePath,
};

export default nextConfig;
