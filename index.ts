import type { PluginContext } from "@getpaseo/plugin";
import { z } from "zod";
import { DiagramItem, TextItem } from "./item.client";
import { DIAGRAM_KIND, split, TEXT_KIND } from "./transform.shared";

const textSchema = z.object({ text: z.string() });
const diagramSchema = z.object({ source: z.string() });

/**
 * Renders Mermaid diagrams inside the transcript.
 *
 * A transformer replaces the whole timeline entry, so a message carrying a
 * diagram is split into its parts and every part is emitted as a plugin item:
 * the prose keeps its place instead of disappearing with the code fence.
 *
 * The item stores the Mermaid source rather than a parsed graph. Parsing happens
 * at render time, which keeps the stored data small and lets a later fix to the
 * parser improve diagrams that were sent months ago.
 */
export default function contribute(plugin: PluginContext) {
  // Registered one by one rather than in a loop: the contribution is generic in
  // the item type, and a loop widens it to a union that no longer infers `item`.
  plugin.addTimelineTransformer({
    id: "mermaid-assistant",
    query: { itemType: "assistant_message" },
    transform: ({ item }) => split(item.text),
  });
  plugin.addTimelineTransformer({
    id: "mermaid-user",
    query: { itemType: "user_message" },
    transform: ({ item }) => split(item.text),
  });

  plugin.addTimelineRenderer({
    kind: DIAGRAM_KIND,
    version: 1,
    schema: diagramSchema,
    Component: DiagramItem,
  });
  plugin.addTimelineRenderer({
    kind: TEXT_KIND,
    version: 1,
    schema: textSchema,
    Component: TextItem,
  });

  return () => {};
}
