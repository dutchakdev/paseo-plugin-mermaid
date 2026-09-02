/**
 * Splits an assistant message into the parts this plugin renders.
 *
 * A transformer replaces the whole timeline entry, so once a message contains a
 * diagram the plugin owns everything in it. Splitting keeps the prose intact as
 * its own item instead of discarding it.
 */

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "mermaid"; source: string };

const FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$/;

/**
 * Walks fenced blocks rather than reaching for one regex: a message can hold a
 * shell block whose contents look like a fence, and only tracking the opening
 * marker gets that right.
 */
export function segmentMessage(text: string): Segment[] {
  const segments: Segment[] = [];
  const lines = text.split("\n");
  let prose: string[] = [];
  let fence: string | null = null;
  let language = "";
  let body: string[] = [];

  const flushProse = () => {
    const joined = prose.join("\n").trim();
    if (joined.length > 0) segments.push({ kind: "text", text: joined });
    prose = [];
  };

  for (const line of lines) {
    const match = FENCE.exec(line);

    if (fence === null) {
      if (match) {
        fence = match[1];
        language = match[2].toLowerCase();
        body = [];
      } else {
        prose.push(line);
      }
      continue;
    }

    // A closing fence must be at least as long as the opening one and carry no
    // language, which is how nested fences inside a block stay part of the body.
    if (match && match[1][0] === fence[0] && match[1].length >= fence.length && match[2] === "") {
      if (language === "mermaid") {
        flushProse();
        segments.push({ kind: "mermaid", source: body.join("\n").trim() });
      } else {
        prose.push(`${fence}${language}`, ...body, fence);
      }
      fence = null;
      body = [];
      continue;
    }

    body.push(line);
  }

  // An unterminated mermaid fence is claimed anyway, while the diagram is still
  // arriving. Paseo renders ```mermaid fences itself, and it starts the moment the
  // fence opens, so a transformer that politely waits for the closing fence has
  // already lost the item to the host and only wins it back on the next
  // reprojection. That is the whole reason a fresh diagram used to look different
  // from the same diagram after a reload. Other unterminated fences stay prose.
  if (fence !== null) {
    if (language === "mermaid") {
      flushProse();
      segments.push({ kind: "mermaid", source: body.join("\n").trim() });
    } else {
      prose.push(`${fence}${language}`, ...body);
    }
  }
  flushProse();
  return segments;
}

/**
 * True when the source already names a diagram this plugin draws.
 *
 * Half-arrived source parses to nothing, and complaining that it is unsupported
 * would be wrong: it is unfinished, not unsupported.
 */
export function namesADiagram(source: string): boolean {
  const first = source.split("\n").find((line) => line.trim().length > 0) ?? "";
  return /^(flowchart|graph|sequenceDiagram)\b/.test(first.trim());
}

/** True when the message is worth taking over at all. */
export function hasMermaid(text: string): boolean {
  return segmentMessage(text).some((segment) => segment.kind === "mermaid");
}
