import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Puppeteer/Chromiumをサーバーレス環境で動作させるための設定
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // Turbopack設定（Next.js 16ではTurbopackがデフォルト）
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // サーバーサイドでchromiumを外部パッケージとして扱う
      config.externals = config.externals || [];
      config.externals.push('@sparticuz/chromium');
    }
    return config;
  },
};

export default nextConfig;
