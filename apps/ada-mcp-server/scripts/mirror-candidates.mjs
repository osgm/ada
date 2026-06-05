/**
 * 内联 @ada/download-probe 镜像候选（零 npm 依赖）
 * 同步：node ../../scripts/build/sync-download-probe-vendor.mjs
 */

/**
 * 常用下载源候选（npm registry / Playwright CDN）
 */
/** tarball 测速默认顺序（仅阿里 / 华为 / 官网；SKIP 测速时用列表首项） */
export const DEFAULT_NPM_REGISTRY_CANDIDATES = [
    "https://registry.npmmirror.com",
    "https://repo.huaweicloud.com/repository/npm",
    "https://registry.npmjs.org"
];
export const CHINA_NPM_REGISTRY_HINTS = [
    "npmmirror",
    "huaweicloud",
    "huawei.com"
];
/** Playwright Chromium zip 测速（2026-06 本机：cdn.playwright.dev 可用；npmmirror/azureedge 当前构建不可用） */
export const DEFAULT_PLAYWRIGHT_HOST_CANDIDATES = [
    "https://cdn.playwright.dev",
    "https://cdn.npmmirror.com/binaries/playwright",
    "https://npmmirror.com/mirrors/playwright",
    "https://playwright.azureedge.net"
];
export const CHINA_PLAYWRIGHT_HOST_PRIORITY = [
    "https://cdn.npmmirror.com/binaries/playwright",
    "https://npmmirror.com/mirrors/playwright"
];
export function isChinaFriendlyNpmRegistry(registry) {
    const r = registry.toLowerCase();
    return CHINA_NPM_REGISTRY_HINTS.some((hint) => r.includes(hint));
}
