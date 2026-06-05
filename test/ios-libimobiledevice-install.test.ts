import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_IOS_LIBIMOBILEDEVICE_WIN_X64_URL,
  parseIosLibimobiledeviceDownloadUrls
} from "@ada/install-deps";

test("parseIosLibimobiledeviceDownloadUrls merges env, config and default on win32 x64", () => {
  const prevUrls = process.env.ADA_IOS_LIBIMOBILEDEVICE_DOWNLOAD_URLS;
  process.env.ADA_IOS_LIBIMOBILEDEVICE_DOWNLOAD_URLS = "https://example.com/custom.zip";
  try {
    const urls = parseIosLibimobiledeviceDownloadUrls({
      dependencies: {
        autoInstallOnStart: false,
        playwrightBrowser: "chromium",
        playwrightInstallTargets: ["chromium"],
        playwrightDownloadHost: "",
        npmRegistryCandidates: [],
        playwrightHostCandidates: [],
        iosLibimobiledeviceDownloadUrls: ["https://example.com/from-config.zip"]
      }
    });
    assert.ok(urls.includes("https://example.com/custom.zip"));
    assert.ok(urls.includes("https://example.com/from-config.zip"));
    if (process.platform === "win32" && process.arch === "x64") {
      assert.ok(urls.includes(DEFAULT_IOS_LIBIMOBILEDEVICE_WIN_X64_URL));
    }
  } finally {
    if (prevUrls === undefined) delete process.env.ADA_IOS_LIBIMOBILEDEVICE_DOWNLOAD_URLS;
    else process.env.ADA_IOS_LIBIMOBILEDEVICE_DOWNLOAD_URLS = prevUrls;
  }
});
