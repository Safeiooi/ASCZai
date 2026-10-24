import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // SDK เหล่านี้ต้องรันแบบ external (ไม่ถูก bundle) ไม่งั้นเรียกโมเดล/OCR ไม่ได้
  serverExternalPackages: ["z-ai-web-dev-sdk", "tesseract.js", "prisma", "@prisma/client"],
};

export default nextConfig;
