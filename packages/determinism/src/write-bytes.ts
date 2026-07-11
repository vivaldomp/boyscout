const encoder = new TextEncoder();

/** Canonical file bytes: LF-only, UTF-8, no BOM, exactly one trailing newline. */
export function writeBytes(content: string): Uint8Array {
  const noBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lf = noBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const withFinalNewline = lf.endsWith("\n") ? lf : `${lf}\n`;
  return encoder.encode(withFinalNewline);
}
