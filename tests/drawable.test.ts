import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { drawable } from "../shared/drawable";

// Diagrams agents wrote for this owner's repositories, copied verbatim from their docs.
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8").trim();
const LAUNCH_ORDER = fixture("launch-order.mmd"); // account-switcher docs/architecture.md
const REQUEST_FLOW = fixture("request-flow.mmd"); // secure-input README
const LAYERS = fixture("layers.mmd"); // machine-status README: subgraphs and `A & B` targets
const VIBER_ARCHITECTURE = fixture("viber-architecture.mmd"); // 2026-11-04: cylinders and a hexagon

describe("drawable, for a finished diagram", () => {
  it.each([
    ["a flowchart with labelled edges and decisions", LAUNCH_ORDER, true],
    ["a sequence diagram with aliases and self-messages", REQUEST_FLOW, true],
    ["a flowchart with subgraphs, which the plugin would draw with lines missing", LAYERS, false],
    ["a flowchart with styling", "flowchart TD\n  A --> B\n  classDef hot fill:#f00\n  class A hot", false],
    ["a sequence diagram with a loop", "sequenceDiagram\n  A->>B: hi\n  loop every minute\n    B->>A: ping\n  end", false],
    ["a diagram type the plugin does not draw", "classDiagram\n  Animal <|-- Duck", false],
    ["front matter before the header", "---\ntitle: Login\n---\nflowchart TD\n  A --> B", false],
    ["a header and nothing to draw", "flowchart TD", false],
    ["a directive that numbers the messages", '%%{init: {"sequence": {"showSequenceNumbers": true}}}%%\nsequenceDiagram\n  A->>B: hi', false],
    ["a directive inside a flowchart", "flowchart TD\n  %%{init: {'theme': 'forest'}}%%\n  A --> B", false],
    ["a plain comment, which draws nothing", "flowchart TD\n  %% the happy path\n  A --> B", true],
    ["quoted nodes joined with &", 'flowchart TD\n  A["one"] & B["two"] --> C', false],
    ["a directive at the end of a line", 'sequenceDiagram\n  A->>B: hi %%{init: {"sequence": {"showSequenceNumbers": true}}}%%', false],
  ])("%s", (_name, source, expected) => {
    expect(drawable(source, null)).toBe(expected);
  });
});

describe("drawable, for the shapes the parser reads", () => {
  it("draws the 2026-11-04 architecture diagram inline", () => {
    expect(drawable(VIBER_ARCHITECTURE, null)).toBe(true);
  });
});

describe("drawable, while the diagram is still growing", () => {
  // `finished` holds the lines that ended in a newline; `pending` is the line being typed.
  it("keeps a diagram whose last line is half typed", () => {
    // `A -` would be a skipped line; judged now, the message would go to Paseo and come back a moment later.
    expect(drawable("flowchart TD\n  B --> C", "  A -")).toBe(true);
  });

  it("keeps a diagram whose header has just ended, though it has nothing to draw yet", () => {
    expect(drawable("flowchart TD", "")).toBe(true);
  });

  it("hands over as soon as a finished line is one the plugin cannot draw", () => {
    expect(drawable("flowchart LR\n  subgraph client", "  A")).toBe(false);
  });

  it.each([
    ["nothing yet", ""],
    ["the first character of a comment", "%"],
    ["the start of a keyword it draws", "flowch"],
    ["the start of a keyword shared with others", "g"],
    ["a header still being typed", "sequenceDiagram"],
  ])("keeps %s, since it can still become a diagram the plugin draws", (_name, pending) => {
    expect(drawable("", pending)).toBe(true);
  });

  it.each([
    ["a keyword it does not draw", "gantt"],
    ["front matter", "---"],
  ])("hands over %s while the first line is still arriving", (_name, pending) => {
    expect(drawable("", pending)).toBe(false);
  });

  it("hands over a finished header no parser accepts", () => {
    expect(drawable("flowchart-elk TD", "  A")).toBe(false);
  });
});

describe("drawable, where the app cannot skew a View", () => {
  // React Native on Android drops `skewX`, so a slanted node would be drawn as an upright box.
  const noSkew = { skew: false };

  it.each([
    ["a parallelogram leaning right", "flowchart LR\n  A[/in/] --> B"],
    ["a parallelogram leaning left", "flowchart LR\n  A[\\out\\] --> B"],
    ["a trapezoid", "flowchart LR\n  A[/base\\] --> B"],
    ["an upside-down trapezoid", "flowchart LR\n  A[\\top/] --> B"],
    ["a Mermaid 11 shape object naming a slanted shape", "flowchart LR\n  A@{ shape: lean-r } --> B"],
  ])("hands over %s", (_name, source) => {
    expect(drawable(source, null, noSkew)).toBe(false);
    expect(drawable(source, null)).toBe(true);
  });

  it("keeps the shapes it draws without skew: cylinders, hexagons, circles, diamonds", () => {
    expect(drawable("flowchart TD\n  A[(db)] --> B{{prep}}\n  B --> C(((done)))\n  C --> D{ok?}", null, noSkew)).toBe(true);
    expect(drawable(VIBER_ARCHITECTURE, null, noSkew)).toBe(true);
  });

  it("hands over while growing as soon as a finished line has a slanted node", () => {
    expect(drawable("flowchart LR\n  A[/in/] --> B", "  B --> C", noSkew)).toBe(false);
  });

  it("does not judge a slanted node on the line still being typed", () => {
    expect(drawable("flowchart LR\n  A --> B", "  B --> C[/out/]", noSkew)).toBe(true);
  });

  it("does not take a diagram back when a later line redefines the slanted node as a box", () => {
    expect(drawable("flowchart LR\n  A[/in/] --> B\n  A[in]", null, noSkew)).toBe(false);
  });
});
