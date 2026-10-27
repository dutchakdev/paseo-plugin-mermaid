import { parseFlowchart } from "./flowchart";
import { parseSequence } from "./sequence";

/** Diagram keywords whose diagrams this plugin draws, in Mermaid's spelling. */
const DRAWN = ["flowchart", "graph", "sequenceDiagram"];

/**
 * Whether this plugin draws everything in a diagram's source.
 *
 * When it does not, the message is left to Paseo, whose own renderer runs Mermaid
 * and draws every diagram type, so a diagram is never shown with lines missing or
 * as bare source. The parsers decide, not a guess from the first word: a line
 * either parser reports as skipped is a line this plugin would not draw.
 *
 * While the fence is open the last line may still be arriving, so only the lines
 * before it are judged: a half-typed edge must not hand the message over and take
 * it back a moment later. Finished lines never change, so for one diagram the
 * answer only ever moves from this plugin to Paseo, and the renderer swaps at most
 * once.
 */
export function drawable(source: string, open: boolean): boolean {
  const lines = source.split("\n");
  const settled = (open ? lines.slice(0, -1) : lines).join("\n");

  const flow = parseFlowchart(settled);
  if (flow) return flow.skipped.length === 0 && (open || flow.nodes.length > 0);
  const sequence = parseSequence(settled);
  if (sequence) return sequence.skipped.length === 0 && (open || sequence.participants.length > 0);

  // No parser takes the finished lines. That is final unless nothing has finished yet.
  if (!open || meaningful(settled)) return false;
  return couldStillName(uncommented(lines[lines.length - 1]));
}

function uncommented(line: string): string {
  return line.replace(/%%.*$/, "").trim();
}

function meaningful(text: string): boolean {
  return text.split("\n").some((line) => uncommented(line).length > 0);
}

/** True while the first line, still arriving, can become a header this plugin draws. */
function couldStillName(line: string): boolean {
  const typed = line.toLowerCase();
  return DRAWN.some((keyword) => {
    const known = keyword.toLowerCase();
    return known.startsWith(typed) || typed.startsWith(known);
  });
}
