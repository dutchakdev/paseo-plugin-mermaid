import type { PluginClientContext } from "@getpaseo/plugin/client";
import * as ui from "@getpaseo/plugin/client/ui";
import { z } from "zod";
import { addFilePanel, hostMarkdown } from "./client/compat";
import { canSkew } from "./client/diagram";
import { MermaidFilePanel } from "./client/file-panel";
import { DiagramItem, TextItem } from "./client/item";
import { DIAGRAM_KIND, split, TEXT_KIND } from "./shared/transform";

const textSchema = z.object({ text: z.string() });
const diagramSchema = z.object({ source: z.string() });

/** Apps from 0.13 have Paseo's Markdown, which draws the diagrams this plugin cannot. */
const hostMarkdownAvailable = hostMarkdown(ui) !== null;

/**
 * Renders Mermaid diagrams inside the transcript.
 *
 * A transformer replaces the whole timeline entry, so a message carrying a
 * diagram is split into its parts and every part is emitted as a plugin item:
 * the prose keeps its place instead of disappearing with the code fence.
 *
 * Paseo runs transformers while building the render model, on every streaming
 * update as well as on the finished message, and memoizes by source item. The
 * transform is therefore pure and synchronous, and it claims a mermaid fence
 * the moment the fence opens so the drawing never swaps renderers mid-stream.
 *
 * The item stores the Mermaid source rather than a parsed graph. Parsing happens
 * at render time, which keeps the stored data small and lets a later fix to the
 * parser improve diagrams that were sent months ago.
 *
 * What this plugin cannot draw in full (see `shared/drawable.ts`) goes to Paseo's
 * Markdown, which runs Mermaid, as a mermaid fence inside the plugin's own text item,
 * so a message with a diagram is never left to Paseo on 0.13 and later. Apps before
 * 0.13 have no such Markdown; there such a message is left to Paseo whole. On
 * Android, where React Native cannot shear a View, a diagram with a parallelogram
 * or trapezoid counts as one this plugin does not draw (`canSkew`).
 *
 * Everything here runs in the app. The plugin has no server entry and starts no
 * daemon process.
 */
export default function contribute(client: PluginClientContext) {
  // Registered one by one rather than in a loop: the contribution is generic in
  // the item type, and a loop widens it to a union that no longer infers `item`.
  client.addTimelineTransformer({
    id: "mermaid-assistant",
    query: { itemType: "assistant_message" },
    transform: ({ item, phase }) => split(item.text, phase, { hostMarkdown: hostMarkdownAvailable, skew: canSkew }),
  });
  client.addTimelineTransformer({
    id: "mermaid-user",
    query: { itemType: "user_message" },
    transform: ({ item, phase }) => split(item.text, phase, { hostMarkdown: hostMarkdownAvailable, skew: canSkew }),
  });

  client.addTimelineRenderer({
    kind: DIAGRAM_KIND,
    version: 1,
    schema: diagramSchema,
    Component: DiagramItem,
  });
  client.addTimelineRenderer({
    kind: TEXT_KIND,
    version: 1,
    schema: textSchema,
    Component: TextItem,
  });

  // Paseo 0.13 and later; older apps skip it.
  addFilePanel(client, {
    id: "mermaid-file",
    title: "Mermaid diagram",
    icon: "Workflow",
    files: { extensions: ["mmd", "mermaid"] },
    Component: MermaidFilePanel,
  });

  return () => {};
}
