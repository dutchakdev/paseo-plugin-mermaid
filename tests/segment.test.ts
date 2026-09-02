import { describe, expect, it } from "vitest";
import { hasMermaid, namesADiagram, segmentMessage } from "../segment.shared";

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

  it("claims an unterminated mermaid fence, so the host renderer never gets it first", () => {
    const segments = segmentMessage("Here:\n\n```mermaid\nflowchart TD\n  A --> B");
    const diagrams = segments.filter((segment) => segment.kind === "mermaid");
    expect(diagrams).toHaveLength(1);
    expect(diagrams[0]).toMatchObject({ source: "flowchart TD\n  A --> B" });
    expect(segments.filter((segment) => segment.kind === "text")).toHaveLength(1);
  });

  it("leaves an unterminated fence of any other language as text", () => {
    const segments = segmentMessage("Here:\n\n```ts\nconst a = 1;");
    expect(segments.every((segment) => segment.kind === "text")).toBe(true);
  });

  it("knows unfinished source from source it cannot draw", () => {
    expect(namesADiagram("flowchart LR")).toBe(true);
    expect(namesADiagram("\n  sequenceDiagram\n  A ->> B: hi")).toBe(true);
    expect(namesADiagram("gantt\n  title Nope")).toBe(false);
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
