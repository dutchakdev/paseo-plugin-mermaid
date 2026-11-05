import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAGRAM_KIND, split, TEXT_KIND } from "../shared/transform";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8").trim();
const fence = (source: string) => "```mermaid\n" + source + "\n```";

// Whole messages as an agent would stream them, character by character.
const MESSAGES: [string, string][] = [
  ["a flowchart the plugin draws", `Here is the launch order:\n\n${fence(fixture("launch-order.mmd"))}\n\nDone.`],
  ["a sequence diagram with messages to oneself", `Flow:\n\n${fence(fixture("request-flow.mmd"))}`],
  ["a flowchart with subgraphs", `Layers:\n\n${fence(fixture("layers.mmd"))}`],
  ["styling at the end", fence("flowchart TD\n  A --> B\n  classDef hot fill:#f00\n  class A hot")],
  ["a comment before the header", fence("%% the happy path\nflowchart TD\n  A --> B")],
  ["a directive before the header", fence("%%{init: {'theme': 'forest'}}%%\nflowchart TD\n  A --> B")],
  ["front matter", fence("---\ntitle: Login\n---\nsequenceDiagram\n  A->>B: hi")],
  ["a type the plugin does not draw", fence("classDiagram\n  Animal <|-- Duck")],
  ["a reference link defined after the diagram", `See [Guide][guide].\n\n${fence("flowchart TD\n  A --> B")}\n\n[guide]: /guide`],
  ["two diagrams, the second one handed over", `${fence("flowchart TD\n  A --> B")}\n\n${fence("flowchart LR\n  subgraph x\n    C\n  end")}`],
];

describe("streaming a message", () => {
  it.each(MESSAGES)("with %s changes renderer at most once after the fence opens, and only towards Paseo", (_name, message) => {
    const opened = message.indexOf("```mermaid") + "```mermaid".length;
    let handedOver = false;
    for (let end = opened; end <= message.length; end += 1) {
      const claimed = split(message.slice(0, end), "streaming") !== undefined;
      if (handedOver && claimed) {
        throw new Error(`taken back from Paseo at ${JSON.stringify(message.slice(0, end).slice(-40))}`);
      }
      if (!claimed) handedOver = true;
    }
    // Streamed to the end, the decision matches the one for the finished message.
    expect(split(message, "streaming") !== undefined).toBe(split(message, "complete") !== undefined);
  });
});

describe("streaming a diagram through Paseo's Markdown", () => {
  it("moves a streaming diagram to Mermaid once", () => {
    const message = fence("flowchart TD\n  A --> B\n  subgraph S\n    C --> D\n  end");
    const opened = message.indexOf("```mermaid") + "```mermaid".length;
    const handedOverAt = message.indexOf("  subgraph S\n") + "  subgraph S\n".length;
    let switched = false;
    for (let end = opened; end <= message.length; end += 1) {
      const items = split(message.slice(0, end), "streaming", { hostMarkdown: true })?.items ?? [];
      // The message is only the diagram, so it has exactly one item at every length.
      expect(items).toHaveLength(1);
      const kind = items[0].kind;
      if (kind === TEXT_KIND) switched = true;
      // It starts as the plugin's drawing, changes at the line the plugin cannot draw, and never changes back.
      expect(kind).toBe(end >= handedOverAt ? TEXT_KIND : DIAGRAM_KIND);
    }
    expect(switched).toBe(true);
  });
});
