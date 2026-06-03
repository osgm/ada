/**
 * 常用下载源候选（npm registry / Playwright CDN）
 */

/** 国内优先 npmmirror；测速相同时列表靠前者优先 */
export const DEFAULT_NPM_REGISTRY_CANDIDATES = [
  "https://registry.npmmirror.com",
  "https://registry.npmjs.org",
  "https://mirrors.cloud.tencent.com/npm",
  "https://mirrors.sjtug.sjtu.edu.cn/npm-registry",
  "https://npmreg.proxy.ustclug.org",
  "https://repo.huaweicloud.com/repository/npm"
] as const;

export const CHINA_NPM_REGISTRY_HINTS = [
  "npmmirror",
  "sjtug",
  "sjtu",
  "ustc",
  "ustclug",
  "tencent",
  "huaweicloud",
  "huawei.com"
] as const;

export const DEFAULT_PLAYWRIGHT_HOST_CANDIDATES = [
  "https://cdn.playwright.dev",
  "https://playwright.azureedge.net",
  "https://cdn.npmmirror.com/binaries/playwright",
  "https://npmmirror.com/mirrors/playwright"
] as const;

export const CHINA_PLAYWRIGHT_HOST_PRIORITY = [
  "https://cdn.npmmirror.com/binaries/playwright",
  "https://npmmirror.com/mirrors/playwright"
] as const;

export function isChinaFriendlyNpmRegistry(registry: string): boolean {
  const r = registry.toLowerCase();
  return CHINA_NPM_REGISTRY_HINTS.some((hint) => r.includes(hint));
}
