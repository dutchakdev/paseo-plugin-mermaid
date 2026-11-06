/**
 * The bracket rewrite of shape objects for Paseo's Mermaid renderer. It walks a line its
 * own way and reads each object through the flowchart parser.
 */

import { OPENERS, readShapeFields, scanShapeObject, type ShapeField } from "./flowchart";

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
 * An object stays as it is when `readShapeFields` refuses it, when its shape has no bracket
 * form here, or when its label holds a `"` that a bracket label cannot. Text that is not a
 * node mention is never rewritten: a `@{` in a quoted label, in an edge label or in a
 * comment, or after something other than an id (`A[x]@{ ... }`). Everything else in the
 * source, line breaks included, comes back byte for byte.
 */
export function classicShapes(source: string): string {
  return source.split("\n").map(classicShapesInLine).join("\n");
}

function classicShapesInLine(line: string): string {
  if (!line.includes("@{")) return line;

  const pieces = new RegExp(LINE_PIECES);
  let result = "";
  let copied = 0;
  // Where the current node mention starts: after the last operator, edge label, `&` or `;`.
  let mention = 0;

  for (let piece = pieces.exec(line); piece; piece = pieces.exec(line)) {
    if (piece[0] === "%%") break;
    if (piece[0] !== "@{") {
      // A quoted string sits inside a mention (`A["x"]`); everything else starts the next one.
      if (piece[0][0] !== '"') mention = pieces.lastIndex;
      continue;
    }

    const object = scanShapeObject(line, piece.index + 2);
    if (!object) continue;
    // Whatever this object holds, its text is not looked at again.
    pieces.lastIndex = object.end;

    const id = /^\s*([\w.-]+)(\s*)$/.exec(line.slice(mention, piece.index));
    if (!id) continue;
    const bracket = bracketForm(id[1], object.fields);
    if (bracket === null) continue;

    // The parser reads `A @{ ... }` as node A, so the spaces between them go with the object.
    result += line.slice(copied, piece.index - id[2].length) + bracket;
    copied = object.end;
  }
  return result + line.slice(copied);
}

/** The bracket form of the node a shape object gives, label double-quoted, or null when the object cannot be handed over. */
function bracketForm(id: string, fields: ShapeField[]): string | null {
  const read = readShapeFields(fields);
  if (!read) return null;
  const opener = OPENERS.find(({ shape }) => shape === read.shape);
  if (!opener) return null;

  // The text as written, `<br/>` and all: Mermaid breaks the line itself. No label, or a blank one, means the id.
  const text = read.label?.value.trim() ?? "";
  const label = text.length > 0 ? text : id;
  // Cannot happen while `scanShapeObject` refuses a `"` outside a double-quoted value; checked
  // because a bracket label cannot hold one and this is where the output would turn to garbage.
  if (label.includes('"')) return null;
  return `${opener.open}"${label}"${opener.close}`;
}
