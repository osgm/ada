/**
 * 内联 @ada/download-probe 镜像候选（零 npm 依赖）
 * 同步：node ../../scripts/sync-download-probe-vendor.mjs
 */

/**
 * 常用下载源候选（npm registry / Playwright CDN / geckodriver 镜像）
 */
/** 国内优先 npmmirror；测速相同时列表靠前者优先 */
/** 国内优先 npmmirror，其次官方；测速相同时列表靠前者优先 */
export const DEFAULT_NPM_REGISTRY_CANDIDATES = [
  "https://registry.npmmirror.com",
  "https://registry.npmjs.org",
  "https://mirrors.cloud.tencent.com/npm",
  "https://mirrors.sjtug.sjtu.edu.cn/npm-registry",
  "https://npmreg.proxy.ustclug.org",
  "https://repo.huaweicloud.com/repository/npm"
];
export const CHINA_NPM_REGISTRY_HINTS = [
    "npmmirror",
    "sjtug",
    "sjtu",
    "ustc",
    "ustclug",
    "tencent",
    "huaweicloud",
    "huawei.com"
];
export const DEFAULT_PLAYWRIGHT_HOST_CANDIDATES = [
    "https://cdn.playwright.dev",
    "https://playwright.azureedge.net",
    "https://cdn.npmmirror.com/binaries/playwright",
    "https://npmmirror.com/mirrors/playwright"
];
export const CHINA_PLAYWRIGHT_HOST_PRIORITY = [
    "https://cdn.npmmirror.com/binaries/playwright",
    "https://npmmirror.com/mirrors/playwright"
];
export const DEFAULT_GECKODRIVER_MIRROR_CANDIDATES = [
    "https://cdn.npmmirror.com/binaries/geckodriver",
    "https://npmmirror.com/mirrors/geckodriver",
    "https://mirrors.huaweicloud.com/geckodriver"
];
export function isChinaFriendlyNpmRegistry(registry) {
    const r = registry.toLowerCase();
    return CHINA_NPM_REGISTRY_HINTS.some((hint) => r.includes(hint));
}
