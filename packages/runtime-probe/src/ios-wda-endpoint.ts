/** Shared WDA base URL / loopback host resolution (iproxy, probe, driver-ios). */

export function defaultWdaLocalHost(): string {
  const fromEnv = process.env.ADA_IOS_LOCAL_HOST?.trim();
  if (fromEnv) return fromEnv;
  const wda = process.env.ADA_WDA_SERVER_URL?.trim();
  if (wda) {
    try {
      const host = new URL(wda).hostname;
      if (host) return host;
    } catch {
      // ignore
    }
  }
  return "localhost";
}

export function hasExplicitWdaServerUrlEnv(): boolean {
  return Boolean(process.env.ADA_WDA_SERVER_URL?.trim());
}

export function wdaServerUrlForLocalPort(localPort: number, host?: string): string {
  return `http://${host ?? defaultWdaLocalHost()}:${localPort}`;
}

export function defaultWdaServerUrl(): string {
  const fromEnv = process.env.ADA_WDA_SERVER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return wdaServerUrlForLocalPort(8100);
}

/** Set ADA_WDA_SERVER_URL only when the user has not configured it explicitly. */
export function syncWdaServerUrlEnv(url: string): void {
  if (!hasExplicitWdaServerUrlEnv()) {
    process.env.ADA_WDA_SERVER_URL = url.replace(/\/$/, "");
  }
}

export function resolveWdaUrlAfterForward(input: { localPort: number; serverUrl: string }, explicitServerUrl?: string): string {
  if (explicitServerUrl?.trim()) return explicitServerUrl.replace(/\/$/, "");
  if (hasExplicitWdaServerUrlEnv()) return defaultWdaServerUrl();
  return wdaServerUrlForLocalPort(input.localPort);
}

/** Hostnames to probe for a local WDA / iproxy port (localhost ↔ 127.0.0.1). */
export function loopbackHostsForProbe(host: string): string[] {
  const normalized = host.trim().toLowerCase();
  const hosts = [host.trim()];
  if (normalized === "localhost") hosts.push("127.0.0.1");
  if (normalized === "127.0.0.1") hosts.push("localhost");
  return [...new Set(hosts)];
}
