/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Optional native deps pulled in transitively by WalletConnect /
    // AppKit that are not available in the browser bundle.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};
export default nextConfig;
