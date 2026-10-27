import type { PluginTimelineItem } from "@getpaseo/plugin";
import { drawable } from "./drawable";
import { segmentMessage } from "./segment";

export const DIAGRAM_KIND = "mermaid-diagram";
export const TEXT_KIND = "mermaid-text";

/**
 * Turns one message into the items this plugin renders, or leaves it alone.
 *
 * Pure and synchronous because Paseo reruns transformers while reconciling
 * projected history, and because it is the part worth testing.
 */
export function split(text: string): { items: PluginTimelineItem[] } | undefined {
  const segments = segmentMessage(text);
  // Leave the entry alone unless there is a diagram to draw: Paseo renders
  // ordinary Markdown better than this plugin does.
  const diagrams = segments.filter((segment) => segment.kind === "mermaid");
  if (diagrams.length === 0) return undefined;
  // One diagram the plugin cannot draw in full leaves the whole message to Paseo,
  // which draws every diagram in it with Mermaid itself.
  if (!diagrams.every((diagram) => drawable(diagram.source, diagram.open))) return undefined;

  // Pushed one branch at a time rather than mapped through a ternary: a ternary
  // produces a union of the two shapes, and TypeScript gives the absent members
  // `?: undefined`, which the JSON-only item type rejects. `push` type-checks
  // each literal on its own.
  const items: PluginTimelineItem[] = [];
  for (const segment of segments) {
    if (segment.kind === "mermaid") {
      items.push({ type: "plugin", kind: DIAGRAM_KIND, version: 1, data: { source: segment.source } });
    } else {
      items.push({ type: "plugin", kind: TEXT_KIND, version: 1, data: { text: segment.text } });
    }
  }
  return { items };
}
