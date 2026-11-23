/** Session cache: one probe per key, with mutations waiting out older probes. */
export class ToolCheckCache {
  private pending = new Map<string, Promise<void>>();
  private checked = new Set<string>();
  private requested = new Set<string>();

  keys() { return [...this.requested]; }

  async run(key: string, probe: () => Promise<void>, force = false): Promise<void> {
    this.requested.add(key);
    const active = this.pending.get(key);
    if (active) {
      if (!force) return active;
      await active.catch(() => {});
      const replacement = this.pending.get(key);
      if (replacement && replacement !== active) return replacement;
    }
    if (force) this.checked.delete(key);
    if (this.checked.has(key)) return;
    // Defer invocation until the promise is registered, including synchronous failures.
    const task = Promise.resolve().then(probe).then(() => { this.checked.add(key); });
    this.pending.set(key, task);
    try { await task; }
    finally { if (this.pending.get(key) === task) this.pending.delete(key); }
  }
}
