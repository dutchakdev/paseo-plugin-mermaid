import type { PluginTimelineItem } from "@getpaseo/plugin";
import { drawable } from "./drawable";
import { FENCE, segmentMessage, type Segment } from "./segment";

export const DIAGRAM_KIND = "mermaid-diagram";
export const TEXT_KIND = "mermaid-text";

/**
 * Turns one message into the items this plugin renders, or leaves it alone.
 *
 * Pure and synchronous because Paseo reruns transformers while reconciling
 * projected history, and because it is the part worth testing.
 */
export function split(text: string, phase: "streaming" | "complete"): { items: PluginTimelineItem[] } | undefined {
  const segments = segmentMessage(text);
  // Leave the entry alone unless there is a diagram to draw: Paseo renders
  // ordinary Markdown better than this plugin does.
  const diagrams = segments.filter((segment) => segment.kind === "mermaid");
  if (diagrams.length === 0) return undefined;
  // One diagram the plugin cannot draw in full leaves the whole message to Paseo,
  // which draws every diagram in it with Mermaid itself.
  // An open fence is always the end of the text, so its last line is still arriving
  // only while the message streams and has not reached a newline.
  const arriving = phase === "streaming" && !text.endsWith("\n");
  if (!diagrams.every((diagram) => drawable(diagram.source, diagram.open && arriving))) return undefined;

  // Pushed one branch at a time rather than mapped through a ternary: a ternary
  // produces a union of the two shapes, and TypeScript gives the absent members
  // `?: undefined`, which the JSON-only item type rejects. `push` type-checks
  // each literal on its own.
  // Each prose item renders as a Markdown document of its own, so a reference link
  // above a diagram would lose a definition written below it. Every prose item
  // carries them all; Paseo's Markdown renders definitions as nothing.
  const definitions = linkDefinitions(segments);
  const items: PluginTimelineItem[] = [];
  for (const segment of segments) {
    if (segment.kind === "mermaid") {
      items.push({ type: "plugin", kind: DIAGRAM_KIND, version: 1, data: { source: segment.source } });
    } else if (definitions) {
      items.push({ type: "plugin", kind: TEXT_KIND, version: 1, data: { text: segment.text, definitions } });
    } else {
      items.push({ type: "plugin", kind: TEXT_KIND, version: 1, data: { text: segment.text } });
    }
  }
  return { items };
}

/** `[label]: url`, but not a footnote, whose list would repeat under every prose item. */
const DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:\s*\S/;

/** The link reference definitions in a message's prose, outside code blocks, one per line. */
function linkDefinitions(segments: Segment[]): string {
  const found: string[] = [];
  for (const segment of segments) {
    if (segment.kind !== "text") continue;
    let fence: string | null = null;
    for (const line of segment.text.split("\n")) {
      const match = FENCE.exec(line);
      if (fence === null) {
        if (match) fence = match[1];
        else if (DEFINITION.test(line)) found.push(line.trim());
      } else if (match && match[1][0] === fence[0] && match[1].length >= fence.length && match[2] === "") {
        fence = null;
      }
    }
  }
  return found.join("\n");
}
