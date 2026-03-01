/** @type {import('next').NextConfig} */
const isCapacitor = process.env.BUILD_TARGET === 'capacitor';

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Capacitor 建置時靜態匯出（搭配 scripts/build-cap.js 使用）
  ...(isCapacitor && {
    output: 'export',
  }),
}

export default nextConfig
