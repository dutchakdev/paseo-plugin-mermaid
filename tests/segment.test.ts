import { describe, expect, it } from "vitest";
import { hasMermaid, segmentMessage } from "../segment.shared";

describe("segmentMessage", () => {
  it("splits prose, diagram and prose", () => {
    const segments = segmentMessage("Before\n\n```mermaid\nflowchart TD\n A --> B\n```\n\nAfter");
    expect(segments.map((segment) => segment.kind)).toEqual(["text", "mermaid", "text"]);
    expect(segments[1]).toMatchObject({ source: "flowchart TD\n A --> B" });
  });

  it("leaves a message with no diagram as one text segment", () => {
    expect(segmentMessage("just words")).toEqual([{ kind: "text", text: "just words" }]);
  });

  it("keeps a non-mermaid code block inside the prose", () => {
    const segments = segmentMessage("```ts\nconst a = 1;\n```");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kind: "text" });
    expect((segments[0] as { text: string }).text).toContain("const a = 1;");
  });

  it("does not close a block on a fence that carries a language", () => {
    const segments = segmentMessage("```mermaid\nflowchart TD\n```ts\n A --> B\n```");
    expect(segments.filter((segment) => segment.kind === "mermaid")).toHaveLength(1);
  });

  it("keeps an unterminated fence as text, since the message may still be streaming", () => {
    const segments = segmentMessage("Here:\n\n```mermaid\nflowchart TD");
    expect(segments.every((segment) => segment.kind === "text")).toBe(true);
  });

  it("finds several diagrams in one message", () => {
    const segments = segmentMessage("```mermaid\nA\n```\ntext\n```mermaid\nB\n```");
    expect(segments.filter((segment) => segment.kind === "mermaid")).toHaveLength(2);
  });

  it("reports whether a message is worth taking over", () => {
    expect(hasMermaid("```mermaid\nflowchart TD\n```")).toBe(true);
    expect(hasMermaid("no diagram here")).toBe(false);
  });
});
