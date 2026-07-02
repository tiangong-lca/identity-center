import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // 锚定工作区根为本项目,避免上层 lockfile 干扰 standalone 输出路径
  turbopack: { root: path.resolve(".") },
  outputFileTracingRoot: path.resolve("."),
};

export default withNextIntl(nextConfig);
