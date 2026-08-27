import { describe, expect, it } from "vitest";
import { parseFlowchart } from "../flowchart.shared";
import { assignLayers, layoutFlowchart, layoutSequence, measureNode } from "../layout.shared";

const chart = (source: string) => parseFlowchart(source)!;

describe("measureNode", () => {
  it("grows a node to fit its longest line", () => {
    const narrow = measureNode({ id: "A", label: "A", shape: "rect" });
    const wide = measureNode({ id: "B", label: "a much longer label", shape: "rect" });
    expect(wide.width).toBeGreaterThan(narrow.width);
  });

  it("grows taller for a multi-line label", () => {
    const one = measureNode({ id: "A", label: "one", shape: "rect" });
    const two = measureNode({ id: "A", label: "one\ntwo", shape: "rect" });
    expect(two.height).toBeGreaterThan(one.height);
  });

  it("keeps a circle square so the label fits inside it", () => {
    const circle = measureNode({ id: "A", label: "hello", shape: "circle" });
    expect(circle.width).toBe(circle.height);
  });
});

describe("assignLayers", () => {
  it("puts a chain on successive layers", () => {
    const graph = chart("flowchart TD\n A --> B --> C");
    const layers = assignLayers(graph.nodes, graph.edges);
    expect([layers.get("A"), layers.get("B"), layers.get("C")]).toEqual([0, 1, 2]);
  });

  it("uses the longest path, not the first one found", () => {
    // A -> C directly, and A -> B -> C. C belongs below B.
    const graph = chart("flowchart TD\n A --> C\n A --> B\n B --> C");
    const layers = assignLayers(graph.nodes, graph.edges);
    expect(layers.get("C")).toBe(2);
  });

  it("terminates on a cycle instead of recursing forever", () => {
    const graph = chart("flowchart TD\n A --> B\n B --> C\n C --> A");
    const layers = assignLayers(graph.nodes, graph.edges);
    expect(layers.size).toBe(3);
    expect(Math.max(...layers.values())).toBeLessThan(3);
  });

  it("puts two independent roots on the same layer", () => {
    const graph = chart("flowchart TD\n A --> C\n B --> C");
    const layers = assignLayers(graph.nodes, graph.edges);
    expect(layers.get("A")).toBe(layers.get("B"));
  });
});

describe("layoutFlowchart", () => {
  it("stacks layers downward for TD", () => {
    const layout = layoutFlowchart(chart("flowchart TD\n A --> B"));
    const [a, b] = ["A", "B"].map((id) => layout.nodes.find((node) => node.id === id)!);
    expect(b.y).toBeGreaterThan(a.y);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
  });

  it("stacks layers rightward for LR", () => {
    const layout = layoutFlowchart(chart("flowchart LR\n A --> B"));
    const [a, b] = ["A", "B"].map((id) => layout.nodes.find((node) => node.id === id)!);
    expect(b.x).toBeGreaterThan(a.x);
  });

  it("flips the flow for BT", () => {
    const layout = layoutFlowchart(chart("flowchart BT\n A --> B"));
    const [a, b] = ["A", "B"].map((id) => layout.nodes.find((node) => node.id === id)!);
    expect(b.y).toBeLessThan(a.y);
  });

  it("never overlaps two nodes on the same layer", () => {
    const layout = layoutFlowchart(chart("flowchart TD\n R --> A\n R --> B\n R --> C"));
    const row = layout.nodes.filter((node) => node.layer === 1).sort((left, right) => left.x - right.x);
    for (let index = 1; index < row.length; index += 1) {
      expect(row[index].x).toBeGreaterThanOrEqual(row[index - 1].x + row[index - 1].width);
    }
  });

  it("reports a canvas large enough to hold every node", () => {
    const layout = layoutFlowchart(chart("flowchart TD\n R --> A\n R --> B\n A --> C"));
    for (const node of layout.nodes) {
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width + 0.001);
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height + 0.001);
    }
  });

  it("routes an edge with segments and points the arrow along the flow", () => {
    const layout = layoutFlowchart(chart("flowchart TD\n A --> B"));
    const edge = layout.edges[0];
    expect(edge.segments).toHaveLength(3);
    expect(edge.arrowAt?.direction).toBe("down");
  });

  it("gives a line no arrowhead", () => {
    expect(layoutFlowchart(chart("flowchart TD\n A --- B")).edges[0].arrowAt).toBeNull();
  });

  it("places an edge label between its endpoints", () => {
    const layout = layoutFlowchart(chart("flowchart TD\n A -->|yes| B"));
    const [a, b] = ["A", "B"].map((id) => layout.nodes.find((node) => node.id === id)!);
    const label = layout.edges[0].labelAt!;
    expect(label.y).toBeGreaterThan(a.y);
    expect(label.y).toBeLessThan(b.y + b.height);
  });

  it("survives an edge pointing at a node that was never defined", () => {
    const layout = layoutFlowchart({ direction: "TD", nodes: [], edges: [{ from: "A", to: "B", label: null, style: "solid", arrow: true }], skipped: [] });
    expect(layout.edges[0].segments).toEqual([]);
  });
});

describe("layoutSequence", () => {
  const people = [
    { id: "U", label: "User", actor: false },
    { id: "S", label: "Payment gateway", actor: true },
  ];

  it("sizes each column to its own label", () => {
    const layout = layoutSequence(people, 2);
    expect(layout.columns[1].width).toBeGreaterThan(layout.columns[0].width);
  });

  it("never overlaps two columns", () => {
    const layout = layoutSequence(people, 1);
    const [first, second] = layout.columns;
    expect(second.centerX - second.width / 2).toBeGreaterThan(first.centerX + first.width / 2);
  });

  it("stacks one row per event below the header", () => {
    const layout = layoutSequence(people, 3);
    expect(layout.rows).toHaveLength(3);
    expect(layout.rows[0].y).toBeGreaterThanOrEqual(layout.headerHeight);
    expect(layout.rows[2].y).toBeGreaterThan(layout.rows[1].y);
  });

  it("reports a canvas that contains the last column and row", () => {
    const layout = layoutSequence(people, 2);
    const last = layout.columns[layout.columns.length - 1];
    expect(last.centerX + last.width / 2).toBeLessThanOrEqual(layout.width + 0.001);
    expect(layout.height).toBeGreaterThan(layout.rows[1].y);
  });

  it("handles a diagram with no events yet", () => {
    expect(layoutSequence(people, 0).rows).toEqual([]);
  });
});
