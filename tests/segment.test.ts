import { describe, expect, it } from "vitest";
import { hasMermaid, mapMermaidSources, segmentMessage } from "../shared/segment";

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

  it("keeps the line still being typed apart from the finished ones while a fence is open", () => {
    // The hand-off to Paseo judges only finished lines; trimming must not turn a finished line back into a pending one.
    expect(segmentMessage("```mermaid\nflowchart TD\n  A --> B\n```")[0]).toMatchObject({ pending: null, finished: "flowchart TD\n  A --> B" });
    expect(segmentMessage("```mermaid\nflowchart TD\n  A --> B")[0]).toMatchObject({ pending: "  A --> B", finished: "flowchart TD" });
    expect(segmentMessage("```mermaid\nflowchart TD\n  subgraph api\n ")[0]).toMatchObject({ pending: " ", finished: "flowchart TD\n  subgraph api" });
  });

  it("leaves an unterminated fence of any other language as text", () => {
    const segments = segmentMessage("Here:\n\n```ts\nconst a = 1;");
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

describe("mapMermaidSources", () => {
  const upper = (source: string) => source.toUpperCase();

  it("rewrites the body of a mermaid fence and nothing else", () => {
    const text = "Before *this*\n\n```mermaid\nflowchart TD\n  a --> b\n```\n\n[d]: https://example.com\n";
    expect(mapMermaidSources(text, upper)).toBe(
      "Before *this*\n\n```mermaid\nFLOWCHART TD\n  A --> B\n```\n\n[d]: https://example.com\n",
    );
  });

  it("gives the rewrite the body as written, with its indentation and blank lines", () => {
    const seen: string[] = [];
    mapMermaidSources("```mermaid\n\n  a\n\n```", (source) => (seen.push(source), source));
    expect(seen).toEqual(["\n  a\n"]);
  });

  it("keeps the fence lines as written: indentation, trailing spaces, tildes, longer fences, language case", () => {
    const text = "  ```Mermaid  \n  a\n  ```  \n~~~mermaid\nb\n~~~~\n`````mermaid\n```\nc\n`````";
    expect(mapMermaidSources(text, upper)).toBe("  ```Mermaid  \n  A\n  ```  \n~~~mermaid\nB\n~~~~\n`````mermaid\n```\nC\n`````");
  });

  it("rewrites each mermaid fence, in order", () => {
    expect(mapMermaidSources("```mermaid\na\n```\ntext\n```mermaid\nb\n```", upper)).toBe(
      "```mermaid\nA\n```\ntext\n```mermaid\nB\n```",
    );
  });

  it("leaves a fence of any other language, and a mermaid fence inside one, as it is", () => {
    const text = "```ts\nconst a = 1;\n```\n\n````md\n```mermaid\nx\n```\n````\n\n```\nplain\n```";
    expect(mapMermaidSources(text, upper)).toBe(text);
  });

  it("rewrites a fence that is still open, up to the line being typed", () => {
    expect(mapMermaidSources("Here:\n\n```mermaid\nflowchart TD\n  a --", upper)).toBe("Here:\n\n```mermaid\nFLOWCHART TD\n  A --");
    expect(mapMermaidSources("```mermaid", upper)).toBe("```mermaid");
    expect(mapMermaidSources("```mermaid\n", upper)).toBe("```mermaid\n");
  });

  it("leaves an unterminated fence of another language as it is", () => {
    expect(mapMermaidSources("```ts\nconst a = 1;", upper)).toBe("```ts\nconst a = 1;");
  });

  it("gives an empty fence back empty", () => {
    expect(mapMermaidSources("```mermaid\n```", upper)).toBe("```mermaid\n```");
  });

  it("is the message itself when nothing changes, whatever the message holds", () => {
    for (const text of [
      "",
      "plain",
      "\n\n",
      "a\r\nb\r\n",
      "```mermaid\nflowchart TD\n  A --> B\n```",
      "~~~mermaid\nA\n~~~\ntrailing\n\n\n",
      "```mermaid\n  \n```\n```mermaid",
      "```ts\n```mermaid\nA\n```\n```\n",
    ]) {
      expect(mapMermaidSources(text, (source) => source)).toBe(text);
    }
  });

  it("finds the same diagrams segmentMessage does", () => {
    const text = "x\n```mermaid\nA\n```\n````md\n```mermaid\nB\n```\n````\n~~~mermaid\nC\n~~~\n```mermaid\nD";
    const mapped = new Set<string>();
    mapMermaidSources(text, (source) => (mapped.add(source.trim()), source));
    expect([...mapped]).toEqual(
      segmentMessage(text).flatMap((segment) => (segment.kind === "mermaid" ? [segment.source] : [])),
    );
  });
});
