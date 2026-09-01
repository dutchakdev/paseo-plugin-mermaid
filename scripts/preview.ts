/**
 * Renders the README preview.
 *
 * It runs the plugin's own parser and layout, then draws the result as SVG. The
 * geometry is therefore exactly what the plugin computes at runtime; only the
 * drawing backend differs, since a Paseo client bundle has Views where this has
 * SVG. That makes the image a check on the layout rather than a picture of it:
 * when the layout changes, regenerate and the difference is visible.
 *
 *   npm run preview
 */
import { writeFileSync } from "node:fs";
import { parseFlowchart } from "../flowchart.shared.ts";
import { layoutFlowchart, measureNode, type LaidOutEdge, type LaidOutNode } from "../layout.shared.ts";
import { parseSequence } from "../sequence.shared.ts";
import { layoutSequence } from "../layout.shared.ts";

const DARK = {
  surface: "#131516",
  card: "#1a1d1f",
  border: "rgba(255,255,255,0.10)",
  text: "#e8eaec",
  muted: "#9aa1a6",
  accent: "#3987e5",
};

const FLOW = `flowchart TD
    Start([Message arrives]) --> Check{Has mermaid?}
    Check -->|no| Paseo[Paseo renders it]
    Check -->|yes| Split[[Split into segments]]
    Split --> Text(Prose)
    Split --> Code(Diagram source)
    Text --> Md[Minimal markdown]
    Code --> Draw((Views))
    Md --> Draw`;

const SEQ = `sequenceDiagram
    participant P as Plugin
    actor D as Daemon
    P->>D: metrics.read
    D-->>P: cpu, memory, swap
    Note over P,D: no RPC during transform
    P-)D: docker.read`;

const escape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function nodeShape(node: LaidOutNode): string {
  const { x, y, width: w, height: h } = node;
  const fill = `fill="${DARK.surface}" stroke="${DARK.accent}" stroke-width="1"`;
  if (node.shape === "diamond") {
    const side = Math.min(w, h) * 0.72;
    const cx = x + w / 2;
    const cy = y + h / 2;
    return `<rect x="${cx - side / 2}" y="${cy - side / 2}" width="${side}" height="${side}" ${fill} transform="rotate(45 ${cx} ${cy})"/>`;
  }
  const radius = node.shape === "circle" ? w / 2 : node.shape === "stadium" ? h / 2 : node.shape === "round" ? 12 : 4;
  const box = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" ${fill}/>`;
  // The plugin draws a subroutine with an inset rule on each side; without it
  // the preview would show the wrong shape for `[[...]]`.
  if (node.shape !== "subroutine") return box;
  return `${box}<line x1="${x + 5}" y1="${y}" x2="${x + 5}" y2="${y + h}" stroke="${DARK.accent}"/><line x1="${x + w - 5}" y1="${y}" x2="${x + w - 5}" y2="${y + h}" stroke="${DARK.accent}"/>`;
}

function label(node: LaidOutNode): string {
  const lines = node.label.split("\n");
  const startY = node.y + node.height / 2 - ((lines.length - 1) * 15) / 2 + 4;
  return lines
    .map(
      (line, index) =>
        `<text x="${node.x + node.width / 2}" y="${startY + index * 15}" fill="${DARK.text}" font-size="12" font-family="system-ui, sans-serif" text-anchor="middle">${escape(line)}</text>`,
    )
    .join("");
}

function edge(item: LaidOutEdge): string {
  const opacity = item.style === "dotted" ? 0.45 : 1;
  const parts = item.segments.map(
    (segment) =>
      `<rect x="${segment.x}" y="${segment.y}" width="${segment.width}" height="${segment.height}" fill="${DARK.muted}" opacity="${opacity}"/>`,
  );
  if (item.arrowAt) {
    const { x, y } = item.arrowAt;
    parts.push(`<polygon points="${x - 5},${y - 5} ${x + 5},${y - 5} ${x},${y}" fill="${DARK.muted}"/>`);
  }
  if (item.label && item.labelAt) {
    parts.push(
      `<rect x="${item.labelAt.x - 26}" y="${item.labelAt.y - 8}" width="52" height="16" fill="${DARK.card}"/>`,
      `<text x="${item.labelAt.x}" y="${item.labelAt.y + 4}" fill="${DARK.muted}" font-size="10" font-family="system-ui, sans-serif" text-anchor="middle">${escape(item.label)}</text>`,
    );
  }
  return parts.join("");
}

const chart = parseFlowchart(FLOW);
if (!chart) throw new Error("the sample flowchart no longer parses");
const flow = layoutFlowchart(chart);

const sequence = parseSequence(SEQ);
if (!sequence) throw new Error("the sample sequence diagram no longer parses");
const columns = layoutSequence(sequence.participants, sequence.events.length);

const PAD = 24;
const GAP = 40;
const seqOffsetX = flow.width + GAP + PAD;
const width = seqOffsetX + columns.width + PAD;
const height = Math.max(flow.height, columns.height) + PAD * 2 + 26;

const centers = new Map(columns.columns.map((column) => [column.id, column.centerX + seqOffsetX]));
const seqParts: string[] = [];
for (const column of columns.columns) {
  const cx = column.centerX + seqOffsetX;
  seqParts.push(
    `<rect x="${cx - 0.75}" y="${columns.headerHeight + PAD + 26}" width="1.5" height="${columns.height - columns.headerHeight}" fill="${DARK.muted}" opacity="0.4"/>`,
    `<rect x="${cx - column.width / 2}" y="${PAD + 26}" width="${column.width}" height="28" rx="${column.actor ? 14 : 4}" fill="${DARK.surface}" stroke="${DARK.accent}"/>`,
    `<text x="${cx}" y="${PAD + 26 + 18}" fill="${DARK.text}" font-size="12" font-family="system-ui, sans-serif" text-anchor="middle">${escape(column.label)}</text>`,
  );
}
sequence.events.forEach((event, index) => {
  const y = columns.rows[index].y + PAD + 26;
  if (event.kind === "note") {
    const xs = event.over.map((id) => centers.get(id) ?? 0);
    const left = Math.min(...xs) - 30;
    const right = Math.max(...xs) + 30;
    seqParts.push(
      `<rect x="${left}" y="${y + 4}" width="${right - left}" height="22" rx="4" fill="${DARK.surface}" stroke="${DARK.muted}" stroke-opacity="0.5"/>`,
      `<text x="${(left + right) / 2}" y="${y + 19}" fill="${DARK.muted}" font-size="11" font-family="system-ui, sans-serif" text-anchor="middle">${escape(event.text)}</text>`,
    );
    return;
  }
  const from = centers.get(event.from) ?? 0;
  const to = centers.get(event.to) ?? 0;
  const opacity = event.style === "dashed" ? 0.45 : 1;
  seqParts.push(
    `<text x="${(from + to) / 2}" y="${y + 12}" fill="${DARK.text}" font-size="11" font-family="system-ui, sans-serif" text-anchor="middle">${escape(event.text)}</text>`,
    `<rect x="${Math.min(from, to)}" y="${y + 22}" width="${Math.abs(to - from)}" height="1.5" fill="${DARK.muted}" opacity="${opacity}"/>`,
    `<polygon points="${to},${y + 22.75} ${to + (to >= from ? -6 : 6)},${y + 18} ${to + (to >= from ? -6 : 6)},${y + 27}" fill="${DARK.muted}"/>`,
  );
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${DARK.card}" rx="12"/>
<text x="${PAD}" y="${PAD + 4}" fill="${DARK.muted}" font-size="11" font-family="system-ui, sans-serif" letter-spacing="1">FLOWCHART</text>
<text x="${seqOffsetX}" y="${PAD + 4}" fill="${DARK.muted}" font-size="11" font-family="system-ui, sans-serif" letter-spacing="1">SEQUENCE</text>
<g transform="translate(${PAD}, ${PAD + 26})">
${flow.edges.map(edge).join("\n")}
${flow.nodes.map((node) => nodeShape(node) + label(node)).join("\n")}
</g>
${seqParts.join("\n")}
</svg>
`;

writeFileSync(new URL("../docs/preview.svg", import.meta.url), svg);
console.log(`docs/preview.svg  ${width}x${height}  ${flow.nodes.length} nodes, ${flow.edges.length} edges, ${sequence.events.length} events`);
console.log(`widest node: ${Math.max(...chart.nodes.map((n) => measureNode(n).width))}px`);
