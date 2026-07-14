import { describe, expect, it } from "vitest";
import { type FormatLang, createFormatPool, format } from "../src/index.js";

const samples: Array<{ lang: FormatLang; source: string }> = [
  { lang: "ts", source: "const x=1 ;export const y   =2" },
  { lang: "tsx", source: "export const A=()=><div><span>hi</span></div>" },
  { lang: "js", source: "let a=1;let b=2" },
  { lang: "json", source: '{"b":2,"a":1}' },
  { lang: "css", source: ".x{color:red}" },
];

describe("format pool", () => {
  it("produces byte-identical output to sync format() across all langs (drift guard)", async () => {
    const pool = createFormatPool({ size: 2 });
    try {
      for (const s of samples) {
        expect(await pool.format(s.source, s.lang)).toBe(format(s.source, s.lang));
      }
    } finally {
      await pool.close();
    }
  });

  it("handles many concurrent jobs on a small pool", async () => {
    const pool = createFormatPool({ size: 2 });
    try {
      const jobs = Array.from({ length: 20 }, (_, i) => pool.format(`const v${i}=${i}`, "ts"));
      const out = await Promise.all(jobs);
      expect(out[7]).toBe(format("const v7=7", "ts"));
      expect(out).toHaveLength(20);
    } finally {
      await pool.close();
    }
  });

  it("rejects in-flight jobs when closed", async () => {
    const pool = createFormatPool({ size: 1 });
    await pool.close();
    await expect(pool.format("const x=1", "ts")).rejects.toThrow();
  });
});
