/** Per-session reader/writer gate: concurrent reads OK; writes exclusive. */

type Waiter = {
  kind: "read" | "write";
  resume: () => void;
};

export class SessionGate {
  private readers = 0;
  private writer = false;
  private readonly waiters: Waiter[] = [];

  /** 已有写锁或写等待：同 session 并发 navigate 等应换新 sessionId，勿静默排队 */
  isWriteContended(): boolean {
    return this.writer || this.waiters.some((w) => w.kind === "write");
  }

  private pump(): void {
    while (this.waiters.length > 0) {
      const next = this.waiters[0]!;
      if (next.kind === "write") {
        if (this.readers > 0 || this.writer) {
          return;
        }
        this.waiters.shift();
        this.writer = true;
        next.resume();
        return;
      }
      // Prefer draining writers before admitting more readers when a writer is queued.
      if (this.waiters.some((w) => w.kind === "write")) {
        return;
      }
      if (this.writer) {
        return;
      }
      this.waiters.shift();
      this.readers += 1;
      next.resume();
    }
  }

  async acquire(readOnly: boolean): Promise<() => void> {
    if (readOnly) {
      if (!this.writer && !this.waiters.some((w) => w.kind === "write")) {
        this.readers += 1;
        return () => {
          this.readers = Math.max(0, this.readers - 1);
          this.pump();
        };
      }
      await new Promise<void>((resume) => {
        this.waiters.push({ kind: "read", resume });
      });
      return () => {
        this.readers = Math.max(0, this.readers - 1);
        this.pump();
      };
    }

    if (!this.writer && this.readers === 0 && this.waiters.length === 0) {
      this.writer = true;
      return () => {
        this.writer = false;
        this.pump();
      };
    }
    await new Promise<void>((resume) => {
      this.waiters.push({ kind: "write", resume });
    });
    return () => {
      this.writer = false;
      this.pump();
    };
  }
}
