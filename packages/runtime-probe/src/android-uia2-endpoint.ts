/** Shared Android UIA2 base URL / loopback host resolution. */

export function defaultAndroidLocalHost(): string {
  const fromEnv = process.env.ADA_ANDROID_LOCAL_HOST?.trim();
  if (fromEnv) return fromEnv;
  const uia2 = process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim();
  if (uia2) {
    try {
      const host = new URL(uia2).hostname;
      if (host) return host;
    } catch {
      // ignore
    }
  }
  return "localhost";
}

export function hasExplicitUia2ServerUrlEnv(): boolean {
  return Boolean(process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim());
}

export function uia2ServerUrlForLocalPort(localPort: number, host?: string): string {
  return `http://${host ?? defaultAndroidLocalHost()}:${localPort}`;
}

export function defaultUia2ServerUrl(): string {
  const fromEnv = process.env.ADA_ANDROID_UIA2_SERVER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return uia2ServerUrlForLocalPort(8200);
}

export function syncUia2ServerUrlEnv(url: string): void {
  if (!hasExplicitUia2ServerUrlEnv()) {
    process.env.ADA_ANDROID_UIA2_SERVER_URL = url.replace(/\/$/, "");
  }
}

export function resolveUia2UrlAfterForward(input: { localPort: number }, explicitServerUrl?: string): string {
  if (explicitServerUrl?.trim()) return explicitServerUrl.replace(/\/$/, "");
  if (hasExplicitUia2ServerUrlEnv()) return defaultUia2ServerUrl();
  return uia2ServerUrlForLocalPort(input.localPort);
}
