import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { split } from "../shared/transform";

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
