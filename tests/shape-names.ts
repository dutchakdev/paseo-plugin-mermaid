import type { NodeShape } from "../shared/flowchart";

/** Mermaid 11.16 short names and aliases for the shapes the plugin draws. */
export const SHAPE_NAMES: [NodeShape, string[]][] = [
  ["rect", ["rect", "proc", "process", "rectangle"]],
  ["round", ["rounded", "event"]],
  ["stadium", ["stadium", "terminal", "pill"]],
  ["subroutine", ["fr-rect", "subprocess", "subproc", "framed-rectangle", "subroutine"]],
  ["cylinder", ["cyl", "db", "database", "cylinder"]],
  ["circle", ["circle", "circ"]],
  ["diamond", ["diam", "decision", "diamond", "question"]],
  ["hexagon", ["hex", "hexagon", "prepare"]],
  ["lean-right", ["lean-r", "lean-right", "in-out"]],
  ["lean-left", ["lean-l", "lean-left", "out-in"]],
  ["trapezoid", ["trap-b", "priority", "trapezoid-bottom", "trapezoid"]],
  ["trapezoid-top", ["trap-t", "manual", "trapezoid-top", "inv-trapezoid"]],
  ["double-circle", ["dbl-circ", "double-circle"]],
];
