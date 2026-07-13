export interface SseEvent {
  event: string;
  data: string;
}

/** Parse one SSE frame (lines between blank-line separators). Returns null if it carries no data. */
export function parseFrame(frame: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/** POST a JSON body and read the text/event-stream response, invoking onEvent per frame. */
export async function postSse(
  path: string,
  body: unknown,
  headers: Record<string, string>,
  onEvent: (e: SseEvent) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(path, { method: "POST", headers, body: JSON.stringify(body) });
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx = buf.indexOf("\n\n");
    while (idx >= 0) {
      const e = parseFrame(buf.slice(0, idx));
      if (e) onEvent(e);
      buf = buf.slice(idx + 2);
      idx = buf.indexOf("\n\n");
    }
  }
}
