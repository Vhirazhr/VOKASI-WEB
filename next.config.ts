import type { NextConfig } from 'next';

const trustedOrigins = (process.env.EMBED_ALLOWED_ORIGINS ?? '')
  .split(/[\s,]+/).map(v => v.trim()).filter(v => /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(v));
const frameAncestors = ["'self'", ...trustedOrigins].join(' ');
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors}` },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Content-Type-Options', value: 'nosniff' }
    ] }];
  }
};
export default nextConfig;
