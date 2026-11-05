import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mermaidFence } from "../shared/fence";
import { fileView } from "../shared/file-view";

const LAUNCH_ORDER = readFileSync(join(__dirname, "fixtures", "launch-order.mmd"), "utf8");

describe("fileView", () => {
  it("draws a diagram the plugin draws in full, without the file's trailing newline", () => {
    expect(fileView("flowchart TD\n  A --> B\n")).toEqual({ kind: "diagram", source: "flowchart TD\n  A --> B" });
    expect(fileView(LAUNCH_ORDER).kind).toBe("diagram");
  });

  it("hands any other diagram to Paseo's Markdown as a mermaid fence", () => {
    expect(fileView("classDiagram\n  Animal <|-- Duck\n")).toEqual({
      kind: "markdown",
      markdown: "```mermaid\nclassDiagram\n  Animal <|-- Duck\n```",
    });
  });

  it("makes the fence longer than any backtick run in the source, so the source cannot close it", () => {
    const view = fileView('classDiagram\n  note "run ```make```"');
    expect(view).toEqual({ kind: "markdown", markdown: '````mermaid\nclassDiagram\n  note "run ```make```"\n````' });
  });

  it("says an empty file is empty rather than drawing nothing", () => {
    expect(fileView("  \n\n")).toEqual({ kind: "empty" });
  });
});

describe("mermaidFence", () => {
  it("fences the source for Paseo's Markdown", () => {
    expect(mermaidFence("pie\n  a : 1")).toBe("```mermaid\npie\n  a : 1\n```");
  });

  it("is longer than any backtick run in the source", () => {
    expect(mermaidFence("a\n```\nb")).toBe("````mermaid\na\n```\nb\n````");
  });
});
