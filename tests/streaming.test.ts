import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PluginTimelineItem } from "@getpaseo/plugin";
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

describe("streaming through Paseo's Markdown, what Mermaid is given", () => {
  const host = { hostMarkdown: true };
  const textOf = (item: PluginTimelineItem) => (item.data as { text?: string }).text ?? "";
  /** The diagrams among the items, in order: drawn ones, and the ones fenced for Mermaid. */
  const diagramsOf = (items: PluginTimelineItem[]) =>
    items.filter((item) => item.kind === DIAGRAM_KIND || /^`{3,}mermaid\n/.test(textOf(item)));
  /** The source inside a fenced item. */
  const fenced = (item: PluginTimelineItem) => textOf(item).replace(/^`+mermaid\n/, "").replace(/\n`+$/, "");
  const dedupe = <T,>(values: T[]) => values.filter((value, index) => index === 0 || JSON.stringify(value) !== JSON.stringify(values[index - 1]));

  it("is only lines whose newline has arrived, while the fence is open", () => {
    // Paseo's Markdown draws each update as final, so a half-typed `B --` or `C[Lab` would flash the diagram to code.
    const message = fence("flowchart TD\n  subgraph S\n    A --> B\n    C[Label] --> D@{ shape: db }\n  end");
    for (let end = message.indexOf("\n") + 1; end <= message.length; end += 1) {
      const prefix = message.slice(0, end);
      for (const item of diagramsOf(split(prefix, "streaming", host)?.items ?? [])) {
        if (item.kind !== TEXT_KIND) continue;
        expect(prefix, "handed Mermaid a line still being typed").toContain(`${fenced(item).replace('D[("D")]', "D@{ shape: db }")}\n`);
      }
    }
  });

  it("with two diagrams, keeps the first inline and moves the second to Mermaid once", () => {
    const first = "flowchart TD\n  A --> B";
    const second = "flowchart LR\n  C --> D\n  subgraph S\n    E\n  end";
    const message = `${fence(first)}\n\nand\n\n${fence(second)}`;
    const secondFence = message.lastIndexOf("```mermaid");
    const handedOverAt = message.indexOf("  subgraph S\n", secondFence) + "  subgraph S\n".length;
    const kinds: string[][] = [[], []];
    for (let end = message.indexOf("```mermaid") + "```mermaid".length; end <= message.length; end += 1) {
      const prefix = message.slice(0, end);
      const diagrams = diagramsOf(split(prefix, "streaming", host)?.items ?? []);
      diagrams.forEach((item, index) => kinds[index].push(item.kind));
      if (end > secondFence + "```mermaid".length) {
        expect(diagrams).toHaveLength(2);
        expect(diagrams[1].kind, prefix.slice(secondFence)).toBe(end >= handedOverAt ? TEXT_KIND : DIAGRAM_KIND);
        if (diagrams[1].kind === TEXT_KIND) expect(prefix).toContain(`${fenced(diagrams[1])}\n`);
      }
    }
    expect(dedupe(kinds[0])).toEqual([DIAGRAM_KIND]);
    expect(dedupe(kinds[1])).toEqual([DIAGRAM_KIND, TEXT_KIND]);
  });

  it("with a link definition arriving after the diagram went to Mermaid, moves it into the whole message and never back inline", () => {
    const diagram = "flowchart LR\n  A --> B\n  subgraph S\n    C\n  end";
    const message = `See [the docs][d].\n\n${fence(diagram)}\n\nAfter.\n\n[d]: https://example.com`;
    const states: string[] = [];
    let wentToMermaid = false;
    for (let end = 1; end <= message.length; end += 1) {
      const prefix = message.slice(0, end);
      const items = split(prefix, "streaming", host)?.items;
      states.push(items === undefined ? "Paseo" : items.map((item) => (item.kind === DIAGRAM_KIND ? "inline" : diagramsOf([item]).length > 0 ? "Mermaid" : "text")).join(" "));
      if (items?.some((item) => item.kind === TEXT_KIND && textOf(item).includes("```mermaid"))) wentToMermaid = true;
      if (wentToMermaid) expect(items?.some((item) => item.kind === DIAGRAM_KIND), prefix.slice(-30)).toBe(false);
    }
    expect(dedupe(states)).toEqual([
      "Paseo", // prose only, until the fence opens
      "text inline", // the diagram is drawn while it can be
      "text Mermaid", // its subgraph line has finished
      "text Mermaid text", // the prose after it
      "text", // `[d]:` arrived: the whole message, diagram and all, goes to Paseo's Markdown in one item
    ]);
    const last = split(message, "streaming", host)?.items ?? [];
    expect(last).toEqual([{ type: "plugin", kind: TEXT_KIND, version: 1, data: { text: message } }]);
  });
});

describe("streaming a slanted diagram where the app cannot skew a View", () => {
  const message = fence("flowchart LR\n  A --> B\n  B --> C[/out/]\n  C --> D");
  const opened = message.indexOf("```mermaid") + "```mermaid".length;
  // The slanted node counts once its line has finished, not while it is typed.
  const handedOverAt = message.indexOf("  B --> C[/out/]\n") + "  B --> C[/out/]\n".length;

  it("moves to Mermaid through Paseo's Markdown once, at that line", () => {
    for (let end = opened; end <= message.length; end += 1) {
      const items = split(message.slice(0, end), "streaming", { hostMarkdown: true, skew: false })?.items ?? [];
      expect(items).toHaveLength(1);
      expect(items[0].kind, message.slice(0, end)).toBe(end >= handedOverAt ? TEXT_KIND : DIAGRAM_KIND);
    }
  });

  it("is left to Paseo once, at that line, on apps without Paseo's Markdown", () => {
    for (let end = opened; end <= message.length; end += 1) {
      const claimed = split(message.slice(0, end), "streaming", { hostMarkdown: false, skew: false }) !== undefined;
      expect(claimed, message.slice(0, end)).toBe(end < handedOverAt);
    }
  });
});
