/**
 * The bracket rewrite of shape objects for Paseo's Mermaid renderer. It walks a line its
 * own way and reads each object through the flowchart parser.
 */

import {
  type NodeMention,
  OPENERS,
  readNodeMention,
  readShapeFields,
  readStatement,
  scanShapeObject,
  type ShapeField,
} from "./flowchart";

/**
 * Where a node mention can start and where `@{` can be text instead. One match is one
 * piece of a line, found left to right: the `@{` of an object, a double-quoted string, a
 * `%%` comment, an edge label between pipes, an operator, or the `&` and `;` that run one
 * statement into the next. The operators are the ones Mermaid reads, with the lengthened
 * and the `x` and `o` ended forms, so `A---B@{ ... }` and `A--oB@{ ... }` have a `B`.
 */
// Keep the operators here in step with `OPERATORS` in flowchart.ts: every one the parser reads must also end a mention here.
const LINE_PIECES = /@\{|"[^"]*(?:"|$)|%%|\|[^|]*(?:\||$)|-{2,}[>ox]|-{3,}|-\.+->?|={2,}[>ox]|={3,}|~{3,}|[&;]/g;

/**
 * `source` with each shape object this plugin reads written in Mermaid's bracket syntax,
 * `A@{ shape: db, label: "Orders" }` as `A[("Orders")]`, for a diagram handed to Paseo's
 * own Mermaid renderer. That renderer refuses any source holding `@{`, so left alone such a
 * diagram shows as code even when this plugin understood every object in it.
 *
 * An object that gives no label keeps the last one an earlier mention of the node gave, as
 * in Mermaid (`A[Orders]`, then `A@{ shape: db }`, is a cylinder labelled Orders), and with
 * none it takes the id. Labels are read with the parser's own mention reading; one on a line
 * neither the parser nor the walk here can read is missed, and the id stands in for it.
 *
 * An object stays as it is when `readShapeFields` refuses it, when its shape has no bracket
 * form here, or when its label holds a `"` that a bracket label cannot. Text that is not a
 * node mention is never rewritten: a `@{` in a quoted label, in an edge label or in a
 * comment, or after something other than an id (`A[x]@{ ... }`). Everything else in the
 * source, line breaks included, comes back byte for byte.
 */
export function classicShapes(source: string): string {
  if (!source.includes("@{")) return source;
  // The last label each node has been given so far, for an object that gives none.
  const labels = new Map<string, string>();
  return source
    .split("\n")
    .map((line) => {
      const rewritten = classicShapesInLine(line, labels);
      // Where the parser reads the line, its reading is the one to keep. It also has the node
      // in front of `A -- text --> B`, which the walk cannot tell from the edge label.
      for (const mention of readStatement(line.replace(/%%.*$/, "").trim())?.mentions ?? []) remember(labels, mention);
      return rewritten;
    })
    .join("\n");
}

/** Notes the label a mention gives, if it gives one, as a bracket label writes it: the parser's line breaks go back to `<br/>`. */
function remember(labels: Map<string, string>, mention: NodeMention | null): void {
  if (mention?.labelled) labels.set(mention.node.id, mention.node.label.replace(/\n/g, "<br/>"));
}

function classicShapesInLine(line: string, labels: Map<string, string>): string {
  const pieces = new RegExp(LINE_PIECES);
  let result = "";
  let copied = 0;
  // Where the current node mention starts: after the last operator, edge label, `&` or `;`.
  let mention = 0;
  let end = line.length;
  // The mention up to `to` is over: its label counts for any object later on the line.
  const passed = (to: number) => remember(labels, readNodeMention(line.slice(mention, to)));

  for (let piece = pieces.exec(line); piece; piece = pieces.exec(line)) {
    if (piece[0] === "%%") {
      end = piece.index;
      break;
    }
    if (piece[0] !== "@{") {
      // A quoted string sits inside a mention (`A["x"]`); everything else starts the next one.
      if (piece[0][0] !== '"') {
        passed(piece.index);
        mention = pieces.lastIndex;
      }
      continue;
    }

    const object = scanShapeObject(line, piece.index + 2);
    if (!object) continue;
    // Whatever this object holds, its text is not looked at again.
    pieces.lastIndex = object.end;

    const id = /^\s*([\w.-]+)(\s*)$/.exec(line.slice(mention, piece.index));
    if (!id) continue;
    const bracket = bracketForm(id[1], object.fields, labels.get(id[1]));
    if (bracket === null) continue;

    // The parser reads `A @{ ... }` as node A, so the spaces between them go with the object.
    result += line.slice(copied, piece.index - id[2].length) + bracket;
    copied = object.end;
  }
  passed(end);
  return result + line.slice(copied);
}

/**
 * The bracket form of the node a shape object gives, label double-quoted, or null when the
 * object cannot be handed over. `earlier` is the label the node was last given before it.
 */
function bracketForm(id: string, fields: ShapeField[], earlier: string | undefined): string | null {
  const read = readShapeFields(fields);
  if (!read) return null;
  const opener = OPENERS.find(({ shape }) => shape === read.shape);
  if (!opener) return null;

  // The text as written, `<br/>` and all: Mermaid breaks the line itself. No label, or a
  // blank one, keeps the label given earlier, and with none the id.
  const text = read.label?.value.trim() ?? "";
  const label = text.length > 0 ? text : (earlier ?? id);
  // A bracket label cannot hold a `"`, and the output would turn to garbage. The object's own
  // label has none while `scanShapeObject` refuses one outside a double-quoted value, but a
  // label given earlier can (`A['say "hi"']`).
  if (label.includes('"')) return null;
  return `${opener.open}"${label}"${opener.close}`;
}
