/**
 * Renders the README preview: what the plugin draws, and nothing else.
 *
 * The diagrams come from the plugin's own parser and layout; the SVG only swaps
 * the drawing backend, since a Paseo client bundle has Views where this has
 * shapes. So the picture cannot drift from the code that produces it.
 *
 * There is deliberately no imitation of the Paseo window around it. A drawn
 * frame would claim to be a screenshot of something this script never saw.
 *
 *   npm run preview
 */
import { writeFileSync } from "node:fs";
import { URL } from "node:url";
import { parseFlowchart } from "../shared/flowchart";
import { layoutFlowchart, layoutSequence, type LaidOutEdge, type LaidOutNode } from "../shared/layout";
import { parseSequence } from "../shared/sequence";

const INK = {
  chrome: "#0f1112",
  surface: "#131516",
  card: "#1a1d1f",
  line: "rgba(255,255,255,0.10)",
  text: "#e8eaec",
  muted: "#9aa1a6",
  faint: "#626a70",
  accent: "#3987e5",
  user: "#1d2226",
};

const FLOW = `flowchart LR
    Msg([Message]) --> Check{Has mermaid?}
    Check -->|no| Paseo[Paseo renders it]
    Check -->|yes| Split[[Split]]
    Split --> Draw((Views))
    Split -.->|unparsed| Raw[Show source]`;

const SEQ = `sequenceDiagram
    participant P as Plugin
    actor D as Daemon
    P->>D: metrics.read
    D-->>P: cpu, memory, swap
    Note over P,D: no RPC during transform`;

const esc = (v: string): string => v.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function width(value: string, size: number, bold = false): number {
  let total = 0;
  for (const char of value) {
    if (" .,:;'|!".includes(char)) total += size * 0.3;
    else if ("il".includes(char)) total += size * 0.27;
    else if (/[0-9]/.test(char)) total += size * 0.6;
    else if (/[A-Z%?]/.test(char)) total += size * 0.68;
    else total += size * 0.53;
  }
  return total * (bold ? 1.04 : 1);
}

const text = (x: number, y: number, v: string, fill: string, size: number, weight = "400", anchor: "start" | "middle" | "end" = "start", extra = ""): string =>
  `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="system-ui, -apple-system, sans-serif" text-anchor="${anchor}" ${extra}>${esc(v)}</text>`;

const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0, stroke?: string): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ""}/>`;

/* ------------------------------------------------------------- diagram -- */

function node(item: LaidOutNode): string {
  const { x, y, width: w, height: h } = item;
  const fill = `fill="${INK.surface}" stroke="${INK.accent}"`;
  if (item.shape === "diamond") {
    const side = Math.min(w, h) / Math.SQRT2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    return `<rect x="${cx - side / 2}" y="${cy - side / 2}" width="${side}" height="${side}" ${fill} transform="rotate(45 ${cx} ${cy})"/>`;
  }
  const r = item.shape === "circle" ? w / 2 : item.shape === "stadium" ? h / 2 : item.shape === "round" ? 12 : 4;
  const box = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${fill}/>`;
  if (item.shape !== "subroutine") return box;
  return `${box}<line x1="${x + 5}" y1="${y}" x2="${x + 5}" y2="${y + h}" stroke="${INK.accent}"/><line x1="${x + w - 5}" y1="${y}" x2="${x + w - 5}" y2="${y + h}" stroke="${INK.accent}"/>`;
}

function edge(item: LaidOutEdge): string {
  const opacity = item.style === "dotted" ? 0.45 : 1;
  const out = item.segments.map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${INK.muted}" opacity="${opacity}"/>`);
  if (item.arrowAt) {
    const { x, y, direction } = item.arrowAt;
    out.push(
      direction === "right"
        ? `<polygon points="${x},${y} ${x - 6},${y - 5} ${x - 6},${y + 5}" fill="${INK.muted}"/>`
        : `<polygon points="${x},${y} ${x - 5},${y - 6} ${x + 5},${y - 6}" fill="${INK.muted}"/>`,
    );
  }
  if (item.label && item.labelAt) {
    const w = width(item.label, 10) + 10;
    out.push(
      rect(item.labelAt.x - w / 2, item.labelAt.y - 8, w, 16, INK.card),
      text(item.labelAt.x, item.labelAt.y + 4, item.label, INK.muted, 10, "400", "middle"),
    );
  }
  return out.join("");
}

const chart = parseFlowchart(FLOW);
if (!chart) throw new Error("the sample flowchart no longer parses");
const flow = layoutFlowchart(chart);

const sequence = parseSequence(SEQ);
if (!sequence) throw new Error("the sample sequence no longer parses");
const columns = layoutSequence(sequence.participants, sequence.events.length);

/* --------------------------------------------------------------- chrome -- */

const WIDTH = 980;
const PAD = 26;
const contentX = PAD;

const parts: string[] = [];

const flowY = 58;
const seqY = flowY + flow.height + 56;
const HEIGHT = seqY + columns.height + 24;

parts.push(
  rect(0, 0, WIDTH, HEIGHT, INK.surface, 14),
  text(contentX, 32, "FLOWCHART", INK.faint, 10, "600", "start", 'letter-spacing="1.4"'),
  text(contentX, flowY + flow.height + 34, "SEQUENCE DIAGRAM", INK.faint, 10, "600", "start", 'letter-spacing="1.4"'),
);

parts.push(`<g transform="translate(${contentX}, ${flowY})">${flow.edges.map(edge).join("")}${flow.nodes.map((n) => {
  const lines = n.label.split("\n");
  const startY = n.y + n.height / 2 - ((lines.length - 1) * 15) / 2 + 4;
  return node(n) + lines.map((line, i) => text(n.x + n.width / 2, startY + i * 15, line, INK.text, 12, "400", "middle")).join("");
}).join("")}</g>`);

// the sequence diagram, in the same reply
const centers = new Map(columns.columns.map((c) => [c.id, c.centerX + contentX]));
for (const column of columns.columns) {
  const cx = column.centerX + contentX;
  parts.push(
    `<rect x="${cx - 0.75}" y="${seqY + columns.headerHeight}" width="1.5" height="${columns.height - columns.headerHeight - 12}" fill="${INK.muted}" opacity="0.35"/>`,
    rect(cx - column.width / 2, seqY, column.width, 28, INK.surface, column.actor ? 14 : 4, INK.accent),
    text(cx, seqY + 18, column.label, INK.text, 12, "400", "middle"),
  );
}
sequence.events.forEach((event, index) => {
  const y = seqY + columns.rows[index].y;
  if (event.kind === "note") {
    const xs = event.over.map((id) => centers.get(id) ?? 0);
    const left = Math.min(...xs) - 40;
    const right = Math.max(...xs) + 40;
    parts.push(
      rect(left, y + 4, right - left, 22, INK.card, 4, INK.line),
      text((left + right) / 2, y + 19, event.text, INK.muted, 11, "400", "middle"),
    );
    return;
  }
  const from = centers.get(event.from) ?? 0;
  const to = centers.get(event.to) ?? 0;
  const forward = to >= from;
  parts.push(
    text((from + to) / 2, y + 12, event.text, INK.text, 11, "400", "middle"),
    rect(Math.min(from, to), y + 22, Math.abs(to - from), 1.5, INK.muted, 0),
    `<polygon points="${to},${y + 22.75} ${to + (forward ? -7 : 7)},${y + 18} ${to + (forward ? -7 : 7)},${y + 27}" fill="${INK.muted}"/>`,
  );
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
${parts.join("\n")}
</svg>
`;
writeFileSync(new URL("../docs/preview.svg", import.meta.url), svg);
console.log(`docs/preview.svg  ${WIDTH}x${HEIGHT} · flow ${flow.width}x${flow.height} · ${flow.nodes.length} nodes`);
