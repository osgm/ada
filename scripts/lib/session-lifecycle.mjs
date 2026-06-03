/**
 * 会话生命周期：exit（关 App/浏览器）与 close（会话 + 默认关目标）
 */

/** @param {object} cfg @param {string} [appId] */
export function resolveAppId(cfg, appId) {
  return appId ?? cfg.appId ?? cfg.app_id;
}

/** @param {object} [opts] */
export function shouldKeepTarget(opts = {}) {
  return opts.keepApp === true || opts.keepBrowser === true || opts.keepTarget === true;
}

/**
 * 结束用户可见目标：移动 force-stop App；Web 关闭浏览器会话
 * @param {"web"|"android"|"harmony"|"ios"} platform
 * @param {object} cfg
 * @param {{ run?: (cmd: string, extra?: object) => Promise<unknown>, sessionClose: () => Promise<unknown> }} deps
 */
export function createTargetExit(platform, cfg, { run, sessionClose }) {
  if (platform === "web") {
    return async () => sessionClose();
  }
  return async (appId) => {
    const id = resolveAppId(cfg, appId);
    if (!id) return;
    await run("exitApp", { appId: id });
  };
}

/**
 * @param {"web"|"android"|"harmony"|"ios"} platform
 * @param {() => Promise<unknown>} targetExit
 * @param {() => Promise<unknown>} sessionClose
 */
export function createSessionClose(platform, targetExit, sessionClose) {
  const exit = async (appId) => targetExit(appId);

  const close = async (opts = {}) => {
    if (!shouldKeepTarget(opts)) {
      await exit();
      if (platform === "web") return;
    }
    await sessionClose();
  };

  return { exit, close };
}
