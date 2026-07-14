import { Worker } from "node:worker_threads";
import type { FormatLang } from "./format.js";

export interface FormatPool {
  format(source: string, lang: FormatLang): Promise<string>;
  close(): Promise<void>;
}

interface Pending {
  resolve: (content: string) => void;
  reject: (err: Error) => void;
}

// Worker sits beside this module in src/ (no build step; source-direct).
const WORKER_URL = new URL("./format-worker.mjs", import.meta.url);

/**
 * Persistent pool of format-only workers. Each worker owns a cached Biome/WASM
 * instance (init amortized across jobs). Jobs are dispatched round-robin; results
 * are correlated by monotonic id, so completion order does not matter to callers.
 */
export function createFormatPool(opts: { size: number }): FormatPool {
  const size = Math.max(1, opts.size);
  const workers: Worker[] = [];
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let rr = 0;
  let closed = false;

  for (let i = 0; i < size; i++) {
    const w = new Worker(WORKER_URL);
    w.on("message", (msg: { id: number; content?: string; error?: string }) => {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error !== undefined) p.reject(new Error(msg.error));
      else p.resolve(msg.content as string);
    });
    w.on("error", (err) => {
      // A worker crash fails every job routed through it; fail all outstanding to avoid hangs.
      for (const [id, p] of pending) {
        pending.delete(id);
        p.reject(err);
      }
    });
    workers.push(w);
  }

  return {
    format(source: string, lang: FormatLang): Promise<string> {
      if (closed) return Promise.reject(new Error("format pool is closed"));
      const id = nextId++;
      const worker = workers[rr++ % workers.length] as Worker;
      return new Promise<string>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, source, lang });
      });
    },
    async close(): Promise<void> {
      closed = true;
      for (const [id, p] of pending) {
        pending.delete(id);
        p.reject(new Error("format pool closed before job completed"));
      }
      await Promise.all(workers.map((w) => w.terminate()));
    },
  };
}
