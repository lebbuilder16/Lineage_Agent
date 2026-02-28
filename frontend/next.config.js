// @ts-check
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: false },
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.ipfs.dweb.link" },
      { protocol: "https", hostname: "**.arweave.net" },
      { protocol: "https", hostname: "arweave.net" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "dd.dexscreener.com" },
      { protocol: "https", hostname: "img.dexscreener.com" },
      { protocol: "https", hostname: "cf-ipfs.com" },
      { protocol: "https", hostname: "gateway.pinata.cloud" },
      { protocol: "https", hostname: "nftstorage.link" },
      { protocol: "https", hostname: "tokens.jup.ag" },
      { protocol: "https", hostname: "metadata.jup.ag" },
      { protocol: "https", hostname: "bafyb*.ipfs.nftstorage.link" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: (() => {
              const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
              // WebSocket uses wss:// (https) or ws:// (http) — must be explicit in CSP
              const wsUrl = apiUrl.replace(/^https/, 'wss').replace(/^http(?!s)/, 'ws');
              return [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                `connect-src 'self' ${apiUrl} ${wsUrl} https://*.sentry.io`,
                "img-src 'self' data: blob: https:",
                "font-src 'self' data:",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "form-action 'self'",
              ].join("; ");
            })(),
          },
        ],
      },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Silent by default, warn on errors
  silent: true,
  // Don't upload source maps unless SENTRY_AUTH_TOKEN is set
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN,
  // Tunnel Sentry requests through /api/monitoring to avoid ad-blockers
  tunnelRoute: "/monitoring",
});
