/** 解析 E2E 脚本通用 CLI 参数（与 ADA_* 环境变量并存，CLI 优先） */

export interface E2eCliArgs {
  profile?: string;
  profilesFile?: string;
  sessionId?: string;
  outDir?: string;
  commandTimeoutMs?: string;
  searchText?: string;
  uiHeuristicsJson?: string;
  appId?: string;
  bundleId?: string;
  abilityId?: string;
  webUrl?: string;
}

function takeFlag(argv: string[], name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = argv.indexOf(name);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith("-")) {
    return argv[idx + 1];
  }
  return undefined;
}

export function parseE2eCliArgs(argv: string[] = process.argv.slice(2)): E2eCliArgs {
  return {
    profile: takeFlag(argv, "--profile"),
    profilesFile: takeFlag(argv, "--profiles-file"),
    sessionId: takeFlag(argv, "--session-id"),
    outDir: takeFlag(argv, "--out-dir"),
    commandTimeoutMs: takeFlag(argv, "--command-timeout-ms"),
    searchText: takeFlag(argv, "--search-text"),
    uiHeuristicsJson: takeFlag(argv, "--ui-heuristics-json"),
    appId: takeFlag(argv, "--app-id"),
    bundleId: takeFlag(argv, "--bundle-id"),
    abilityId: takeFlag(argv, "--ability-id"),
    webUrl: takeFlag(argv, "--web-url")
  };
}

/** 将 CLI 解析结果写入 process.env（仅填充尚未设置的项） */
export function applyE2eCliToEnv(cli: E2eCliArgs, env: NodeJS.ProcessEnv = process.env): void {
  const set = (key: string, value: string | undefined) => {
    if (value && !env[key]) env[key] = value;
  };
  set("ADA_APP_PROFILE", cli.profile);
  set("ADA_APP_PROFILES_FILE", cli.profilesFile);
  set("ADA_E2E_SESSION_ID", cli.sessionId);
  set("ADA_E2E_OUT_DIR", cli.outDir);
  set("ADA_COMMAND_TIMEOUT_MS", cli.commandTimeoutMs);
  set("ADA_E2E_SEARCH_TEXT", cli.searchText);
  set("ADA_UI_HEURISTICS_JSON", cli.uiHeuristicsJson);
  set("ADA_MOBILE_APP_ID", cli.appId);
  set("ADA_ANDROID_APP_ID", cli.appId);
  set("ADA_HARMONY_APP_ID", cli.appId);
  set("ADA_IOS_BUNDLE_ID", cli.bundleId ?? cli.appId);
  set("ADA_HARMONY_ABILITY_ID", cli.abilityId);
  set("ADA_WEB_URL", cli.webUrl);
}
