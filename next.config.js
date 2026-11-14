const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet v4 breaks under React 18 StrictMode's dev double-mount
  // ("Map container is already initialized" infinite loop). Dev-only flag;
  // production builds are unaffected.
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
}



module.exports = withPWA(nextConfig)
