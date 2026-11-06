/**
 * Splits an assistant message into the parts this plugin renders.
 *
 * A transformer replaces the whole timeline entry, so once a message contains a
 * diagram the plugin owns everything in it. Splitting keeps the prose intact as
 * its own item instead of discarding it.
 */

export type Segment =
  | { kind: "text"; text: string }
  | {
      kind: "mermaid";
      /** The whole diagram, trimmed: what gets drawn. */
      source: string;
      /** The lines that ended in a newline, trimmed. All of `source` once the fence has closed. */
      finished: string;
      /** While the fence is open, the last line as typed so far (possibly empty); null once it has closed. */
      pending: string | null;
    };

const FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$/;

/** A run of the message: lines outside any fence, or one fenced block, with its lines as written. */
type Block =
  | { kind: "lines"; lines: string[] }
  | {
      kind: "fence";
      /** The opening marker: three or more backticks or tildes. */
      marker: string;
      /** Lower case; empty when the fence names none. */
      language: string;
      /** The opening line as written. */
      open: string;
      body: string[];
      /** The closing line as written; null while the fence is still open. */
      close: string | null;
    };

/**
 * Walks fenced blocks rather than reaching for one regex: a message can hold a
 * shell block whose contents look like a fence, and only tracking the opening
 * marker gets that right. Every line lands in exactly one block, as written, so the
 * blocks put back together give the message.
 */
function fenceBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let lines: string[] = [];
  let fence: Extract<Block, { kind: "fence" }> | null = null;

  for (const line of text.split("\n")) {
    const match = FENCE.exec(line);

    if (fence === null) {
      if (match) {
        if (lines.length > 0) blocks.push({ kind: "lines", lines });
        lines = [];
        fence = { kind: "fence", marker: match[1], language: match[2].toLowerCase(), open: line, body: [], close: null };
      } else {
        lines.push(line);
      }
      continue;
    }

    // A closing fence must be at least as long as the opening one and carry no
    // language, which is how nested fences inside a block stay part of the body.
    if (match && match[1][0] === fence.marker[0] && match[1].length >= fence.marker.length && match[2] === "") {
      fence.close = line;
      blocks.push(fence);
      fence = null;
      continue;
    }

    fence.body.push(line);
  }

  if (fence !== null) blocks.push(fence);
  else if (lines.length > 0) blocks.push({ kind: "lines", lines });
  return blocks;
}

/** The parts of a message this plugin renders: prose and mermaid diagrams, in order. Blocks of other languages stay inside the prose. */
export function segmentMessage(text: string): Segment[] {
  const segments: Segment[] = [];
  let prose: string[] = [];

  const flushProse = () => {
    const joined = prose.join("\n").trim();
    if (joined.length > 0) segments.push({ kind: "text", text: joined });
    prose = [];
  };

  for (const block of fenceBlocks(text)) {
    if (block.kind === "lines") {
      prose.push(...block.lines);
    } else if (block.language !== "mermaid") {
      // Another language's block is prose, and an unterminated one stays prose.
      prose.push(`${block.marker}${block.language}`, ...block.body, ...(block.close === null ? [] : [block.marker]));
    } else if (block.close !== null) {
      flushProse();
      const source = block.body.join("\n").trim();
      segments.push({ kind: "mermaid", source, finished: source, pending: null });
    } else {
      // An unterminated mermaid fence is claimed anyway, while the diagram is still
      // arriving. Paseo renders ```mermaid fences itself, and it starts the moment the
      // fence opens, so a transformer that politely waits for the closing fence has
      // already lost the item to the host and only wins it back on the next
      // reprojection. That is the whole reason a fresh diagram used to look different
      // from the same diagram after a reload.
      flushProse();
      // Split before trimming: the raw last line is the one still being typed, and
      // trimming first would make a finished line that is followed by a space look pending.
      segments.push({
        kind: "mermaid",
        source: block.body.join("\n").trim(),
        finished: block.body.slice(0, -1).join("\n").trim(),
        pending: block.body[block.body.length - 1] ?? "",
      });
    }
  }
  flushProse();
  return segments;
}

export interface MapOptions {
  /**
   * Whether the message can still grow. Then the last line of a mermaid fence that is still
   * open is the line being typed, and it is left out: the message ends at the newline before
   * it. Paseo's Markdown draws every update as if it were final, so a half-typed `B --`
   * would turn the diagram to code until its newline arrived. False by default.
   */
  growing?: boolean;
}

/**
 * The message with the body of each mermaid fence, closed or still open, passed through
 * `rewrite`, and every other byte as it was: prose, other fences, the fence lines
 * themselves, indentation and blank lines. Found by the same walk as `segmentMessage`,
 * so what it calls a mermaid fence is what the plugin draws. `rewrite` gets the body as
 * written, untrimmed, and an empty body is left alone.
 */
export function mapMermaidSources(text: string, rewrite: (source: string) => string, options: MapOptions = {}): string {
  const lines: string[] = [];
  for (const block of fenceBlocks(text)) {
    if (block.kind === "lines") {
      lines.push(...block.lines);
      continue;
    }
    lines.push(block.open);
    let body = block.body;
    if (block.language === "mermaid") {
      // An open fence is the end of the message, so its last line is the one being typed.
      if (options.growing && block.close === null && body.length > 0) body = [...body.slice(0, -1), ""];
      if (body.length > 0) body = rewrite(body.join("\n")).split("\n");
    }
    lines.push(...body);
    if (block.close !== null) lines.push(block.close);
  }
  return lines.join("\n");
}

/** True when the message is worth taking over at all. */
export function hasMermaid(text: string): boolean {
  return segmentMessage(text).some((segment) => segment.kind === "mermaid");
}
