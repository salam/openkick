import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export only at build time; dev server needs dynamic route support
  ...(process.env.NODE_ENV === 'production' ? { output: 'export' as const } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  // Proxy to Express backend in development (production uses Apache .htaccess).
  // Uses beforeFiles so trailingSlash redirects don't interfere with API routes.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' },
        { source: '/mcp', destination: 'http://localhost:3001/mcp' },
        { source: '/mcp/:path*', destination: 'http://localhost:3001/mcp/:path*' },
        { source: '/llms.txt', destination: 'http://localhost:3001/llms.txt' },
        { source: '/robots.txt', destination: 'http://localhost:3001/robots.txt' },
        { source: '/.well-known/:path*', destination: 'http://localhost:3001/.well-known/:path*' },
        { source: '/uploads/:path*', destination: 'http://localhost:3001/uploads/:path*' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
