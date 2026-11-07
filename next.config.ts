import type { NextConfig } from "next";
import { securityHeaders } from './lib/security/headers'
import { assertSafeEnvironment } from './lib/security/environment'

assertSafeEnvironment(process.env)

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // Next 16 can log Server Action arguments in development, including form data.
  logging: { serverFunctions: false, incomingRequests: false, browserToTerminal: false },
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '128kb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') }]
  },
};

export default nextConfig;
