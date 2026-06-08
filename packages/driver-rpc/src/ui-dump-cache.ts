import { uiDumpCacheTtlMsFromEnv } from "@ada/core-runtime";

/** UI hierarchy / layout dump 缓存（recipe 与 adapter 共用） */

export function readUiDumpCacheTtlMs(): number {
  return uiDumpCacheTtlMsFromEnv(2000);
}

export function shouldInvalidateDumpOnAction(): boolean {
  const v = process.env.ADA_UI_DUMP_CACHE_INVALIDATE_ON_ACTION;
  if (v === "false" || v === "0") return false;
  return true;
}

export class UiDumpCache {
  private entry?: { raw: string; at: number };

  constructor(private readonly ttlMs = readUiDumpCacheTtlMs()) {}

  get(): string | undefined {
    const hit = this.entry;
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.entry = undefined;
      return undefined;
    }
    return hit.raw;
  }

  set(raw: string): void {
    this.entry = { raw, at: Date.now() };
  }

  invalidate(): void {
    this.entry = undefined;
  }

  async getOrLoad(loader: () => Promise<string>): Promise<string> {
    const cached = this.get();
    if (cached !== undefined) return cached;
    const raw = await loader();
    this.set(raw);
    return raw;
  }
}
