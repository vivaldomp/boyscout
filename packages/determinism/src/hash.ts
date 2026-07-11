import { createHash } from "node:crypto";

/** Lowercase hex SHA-256 over the given bytes. */
export function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
