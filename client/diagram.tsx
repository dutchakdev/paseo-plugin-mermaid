import type { PluginTheme } from "@getpaseo/plugin";
import React from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { parseFlowchart, type Flowchart, type NodeShape } from "../shared/flowchart";
import {
  CYLINDER_CAP,
  DOUBLE_RING_GAP,
  layoutFlowchart,
  layoutSequence,
  SELF_LABEL_GAP,
  SELF_LOOP_WIDTH,
  slantFor,
  type FlowLayout,
  type LaidOutEdge,
  type LaidOutNode,
} from "../shared/layout";
import { parseSequence, type SeqEvent, type SequenceDiagram } from "../shared/sequence";
import type { Size } from "../shared/zoom";

/**
 * Draws Mermaid with plain Views.
 *
 * A Paseo client bundle has no SVG, no canvas and no webview, and Mermaid itself
 * needs a DOM, so nothing can render the source directly. Every line here is a
 * positioned View: node boxes, one-and-a-half pixel edge segments, and
 * arrowheads made from a View with three transparent borders.
 *
 * Everything is drawn at the natural size of the layout. Fitting it to a row or
 * a window, and zooming, is the viewer's job (viewer.tsx), so the drawing does
 * not need to know where it is.
 */

const ARROW = 5;

/**
 * Whether this app can shear a View, which the parallelograms and trapezoids need.
 * React Native on Android drops `skewX`, so there a diagram with one of them goes to
 * Mermaid as soon as the line that gives the shape has finished (`drawable`'s
 * `skew` option).
 */
export const canSkew = Platform.OS !== "android";

export type ParsedDiagram =
  | { kind: "flow"; layout: FlowLayout; skipped: Flowchart["skipped"] }
  | { kind: "sequence"; diagram: SequenceDiagram; size: Size }
  | { kind: "unsupported" };

export type DrawableDiagram = Exclude<ParsedDiagram, { kind: "unsupported" }>;

/** Reads the source as whichever diagram it names, laid out at natural size. */
export function parseDiagram(source: string): ParsedDiagram {
  const flow = parseFlowchart(source);
  if (flow && flow.nodes.length > 0) return { kind: "flow", layout: layoutFlowchart(flow), skipped: flow.skipped };
  const sequence = parseSequence(source);
  if (sequence && sequence.participants.length > 0) {
    const box = layoutSequence(sequence.participants, sequence.events.length, sequence.events);
    return { kind: "sequence", diagram: sequence, size: { width: box.width, height: box.height } };
  }
  return { kind: "unsupported" };
}

/** The size the drawing was laid out at, before any fitting or zoom. */
export function naturalSize(parsed: DrawableDiagram): Size {
  return parsed.kind === "flow" ? { width: parsed.layout.width, height: parsed.layout.height } : parsed.size;
}

/** Draws a parsed diagram at its natural size; the caller scales and places it. */
export function Drawing({ parsed, theme }: { parsed: DrawableDiagram; theme: PluginTheme }) {
  return parsed.kind === "flow" ? (
    <FlowchartView layout={parsed.layout} theme={theme} />
  ) : (
    <SequenceView diagram={parsed.diagram} theme={theme} />
  );
}

/**
 * Source that names no diagram yet. The transform hands every diagram this plugin
 * cannot draw to Paseo, so what reaches here is a diagram still arriving, shown as
 * it is typed until its header settles.
 */
export function Arriving({ source, theme }: { source: string; theme: PluginTheme }) {
  return (
    <View
      style={{
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.foregroundMuted,
        padding: 10,
      }}
    >
      <Text selectable style={{ color: theme.colors.foreground, fontFamily: "Menlo", fontSize: 12 }}>
        {source}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Flowchart                                                                    */
/* -------------------------------------------------------------------------- */

function radiusFor(shape: NodeShape, node: LaidOutNode): number {
  if (shape === "circle") return node.width / 2;
  if (shape === "stadium") return node.height / 2;
  if (shape === "round") return 12;
  return 4;
}

function FlowchartView({ layout, theme }: { layout: FlowLayout; theme: PluginTheme }) {
  return (
    <View style={{ width: layout.width, height: layout.height, paddingBottom: 4 }}>
      {layout.edges.map((edge, index) => (
        <EdgeView key={index} edge={edge} theme={theme} />
      ))}
      {layout.nodes.map((node) => (
        <NodeView key={node.id} node={node} theme={theme} />
      ))}
    </View>
  );
}

function NodeView({ node, theme }: { node: LaidOutNode; theme: PluginTheme }) {
  const common = {
    position: "absolute" as const,
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
  };

  if (node.shape === "diamond") {
    // A square turned 45 degrees is the diamond. Its side is the box divided by
    // root two, so the rotated corners reach the box edges and an arrow routed to
    // the box touches the shape. The label sits upright on top, which avoids
    // counter-rotating text and the clipping that brings.
    const side = Math.min(node.width, node.height) / Math.SQRT2;
    return (
      <View style={[common, { alignItems: "center", justifyContent: "center" }]}>
        <View
          style={{
            position: "absolute",
            width: side,
            height: side,
            transform: [{ rotate: "45deg" }],
            borderWidth: 1,
            borderColor: theme.colors.accent,
            backgroundColor: theme.colors.surface0,
          }}
        />
        <Text numberOfLines={2} style={{ color: theme.colors.foreground, fontSize: 12, textAlign: "center" }}>
          {node.label}
        </Text>
      </View>
    );
  }

  if (BUILT.has(node.shape)) {
    return (
      <View style={common}>
        <Outline node={node} theme={theme} />
        <View style={[{ position: "absolute", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, labelArea(node)]}>
          <Text style={{ color: theme.colors.foreground, fontSize: 12, textAlign: "center" }}>{node.label}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        common,
        {
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 8,
          borderWidth: 1,
          borderColor: theme.colors.accent,
          borderRadius: radiusFor(node.shape, node),
          backgroundColor: theme.colors.surface0,
        },
      ]}
    >
      {node.shape === "subroutine" ? (
        <View
          style={{
            position: "absolute",
            left: 5,
            right: 5,
            top: 0,
            bottom: 0,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: theme.colors.accent,
          }}
        />
      ) : null}
      <Text style={{ color: theme.colors.foreground, fontSize: 12, textAlign: "center" }}>{node.label}</Text>
    </View>
  );
}

/**
 * Shapes no single box can draw. Each is built from a few Views behind an upright
 * label, so no text is ever rotated or sheared. Their outlines reach the box
 * where the layout routes edges to it: the top and bottom middle, and at
 * mid-height either the box side or, for slanted sides, `sideInset` in from it.
 */
const BUILT: ReadonlySet<NodeShape> = new Set([
  "cylinder",
  "hexagon",
  "lean-right",
  "lean-left",
  "trapezoid",
  "trapezoid-top",
  "double-circle",
]);

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The part of a built shape's box that its outline leaves clear for the label. */
function labelArea(node: LaidOutNode): Box {
  const { width, height } = node;
  switch (node.shape) {
    case "cylinder":
      // Below the lid's two arcs, above the base's one.
      return { left: 0, top: 2 * CYLINDER_CAP, width, height: height - 3 * CYLINDER_CAP };
    case "hexagon":
      return { left: height / 2, top: 0, width: width - height, height };
    case "lean-right":
    case "lean-left": {
      const slant = slantFor(height);
      return { left: slant / 2, top: 0, width: width - slant, height };
    }
    case "trapezoid":
    case "trapezoid-top": {
      // The narrow side bounds the label.
      const slant = slantFor(height);
      return { left: slant, top: 0, width: width - 2 * slant, height };
    }
    case "double-circle":
      return {
        left: DOUBLE_RING_GAP,
        top: DOUBLE_RING_GAP,
        width: width - 2 * DOUBLE_RING_GAP,
        height: height - 2 * DOUBLE_RING_GAP,
      };
    default:
      return { left: 0, top: 0, width, height };
  }
}

function Outline({ node, theme }: { node: LaidOutNode; theme: PluginTheme }) {
  const { width, height } = node;
  const accent = theme.colors.accent;
  const fill = theme.colors.surface0;
  const outline: ViewStyle = { borderWidth: 1, borderColor: accent, backgroundColor: fill };
  // A plain filled View: a line, or an area of fill with no border of its own.
  const solid = (left: number, top: number, w: number, h: number, color: string) => (
    <View style={{ position: "absolute", left, top, width: w, height: h, backgroundColor: color }} />
  );

  // Where a View's edge falls across a line of the outline, that View must not
  // paint fill under the line: at a fractional pixel, as under the viewer's
  // scale, the browser blends the fill into the line along that edge and the
  // outline shows a light notch. So at every join lines meet lines and fill
  // meets fill.
  switch (node.shape) {
    case "cylinder": {
      // The base ellipse first, the body over its upper half so only the lower arc
      // shows, the whole lid last. The body's sides start and end on the ellipses'
      // centre lines, where the ellipses are widest and run straight down; its
      // fill stops at the sides instead of running under them.
      const ellipse = (top: number) => (
        <View
          style={[outline, { position: "absolute", left: 0, top, width, height: 2 * CYLINDER_CAP, borderRadius: "50%" }]}
        />
      );
      const body = height - 2 * CYLINDER_CAP;
      return (
        <>
          {ellipse(height - 2 * CYLINDER_CAP)}
          {solid(1, CYLINDER_CAP, width - 2, body, fill)}
          {solid(0, CYLINDER_CAP, 1, body, accent)}
          {solid(width - 1, CYLINDER_CAP, 1, body, accent)}
          {ellipse(0)}
        </>
      );
    }
    case "hexagon": {
      // Two diamonds give the points, as in the diamond shape: a square of side
      // height / root two, turned 45 degrees, spans the height and reaches the box
      // side with its corner. A band between their centres covers their inner
      // halves and draws the flat top and bottom.
      const side = height / Math.SQRT2;
      const point = (centre: number) => (
        <View
          style={[
            outline,
            {
              position: "absolute",
              left: centre - side / 2,
              top: (height - side) / 2,
              width: side,
              height: side,
              transform: [{ rotate: "45deg" }],
            },
          ]}
        />
      );
      return (
        <>
          {point(height / 2)}
          {point(width - height / 2)}
          <View
            style={{
              position: "absolute",
              left: height / 2,
              top: 0,
              width: width - height,
              height,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: accent,
              backgroundColor: fill,
            }}
          />
        </>
      );
    }
    case "lean-right":
    case "lean-left":
      return <Parallelogram node={node} sides={node.shape === "lean-right" ? "/" : "\\"} left={0} outline={outline} />;
    case "trapezoid":
    case "trapezoid-top": {
      // The left half of one parallelogram and the right half of the other, each
      // clipped to its half of the box and overlapping a pixel each way around
      // the middle, where both hold the same top and bottom lines and the same
      // fill. The clip edges cut through those lines, so the fill sits in a child
      // inside the borders rather than under them. `[/ \]` is wide at the bottom.
      const wideAtBottom = node.shape === "trapezoid";
      const half = width / 2;
      const clip: ViewStyle = { position: "absolute", top: 0, width: half + 1, height, overflow: "hidden" };
      const lines: ViewStyle = { borderColor: accent, borderTopWidth: 1, borderBottomWidth: 1 };
      const inside = <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: fill }} />;
      return (
        <>
          <View style={[clip, { left: 0 }]}>
            <Parallelogram node={node} sides={wideAtBottom ? "/" : "\\"} left={0} outline={[lines, { borderLeftWidth: 1 }]}>
              {inside}
            </Parallelogram>
          </View>
          <View style={[clip, { left: half - 1 }]}>
            <Parallelogram
              node={node}
              sides={wideAtBottom ? "\\" : "/"}
              left={half - 1}
              outline={[lines, { borderRightWidth: 1 }]}
            >
              {inside}
            </Parallelogram>
          </View>
        </>
      );
    }
    case "double-circle": {
      const inner = width - 2 * DOUBLE_RING_GAP;
      return (
        <>
          <View style={[outline, { position: "absolute", left: 0, top: 0, width, height, borderRadius: width / 2 }]} />
          <View
            style={{
              position: "absolute",
              left: DOUBLE_RING_GAP,
              top: DOUBLE_RING_GAP,
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              borderWidth: 1,
              borderColor: accent,
            }}
          />
        </>
      );
    }
    default:
      return null;
  }
}

/**
 * A View one slant narrower than the box, centred in it and sheared about its
 * middle: the top and bottom edges move half the slant in opposite directions,
 * so the far corners reach both sides of the box and the sides run `/` or `\`.
 * The slant is the layout's own, which is what puts the side where a horizontal
 * edge stops. `left` is where the box starts inside a clipping parent.
 *
 * React Native on Android applies no skew and leaves the upright View between the
 * two mid-height points. There a diagram with these shapes goes to Mermaid
 * (`canSkew`), so that box shows only while the line giving the shape is typed.
 */
function Parallelogram({
  node,
  sides,
  left,
  outline,
  children,
}: {
  node: LaidOutNode;
  sides: "/" | "\\";
  left: number;
  outline: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const slant = slantFor(node.height);
  const angle = (Math.atan(slant / node.height) * 180) / Math.PI;
  return (
    <View
      style={[
        outline,
        {
          position: "absolute",
          left: slant / 2 - left,
          top: 0,
          width: node.width - slant,
          height: node.height,
          // A positive skew moves the bottom edge right, which runs the sides `\`.
          transform: [{ skewX: `${sides === "/" ? -angle : angle}deg` }],
        },
      ]}
    >
      {children}
    </View>
  );
}

function EdgeView({ edge, theme }: { edge: LaidOutEdge; theme: PluginTheme }) {
  const color = theme.colors.foregroundMuted;
  return (
    <>
      {edge.segments.map((segment, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            left: segment.x,
            top: segment.y,
            width: segment.width,
            height: segment.height,
            backgroundColor: color,
            // A dotted edge is drawn dimmer; React Native cannot dash a View.
            opacity: edge.style === "dotted" ? 0.45 : 1,
          }}
        />
      ))}
      {edge.arrowAt ? <Arrow at={edge.arrowAt} color={color} /> : null}
      {edge.label && edge.labelAt ? (
        <Text
          numberOfLines={1}
          style={{
            position: "absolute",
            left: edge.labelAt.x - 60,
            top: edge.labelAt.y - 9,
            width: 120,
            textAlign: "center",
            fontSize: 10,
            color: theme.colors.foregroundMuted,
            backgroundColor: theme.colors.surface0,
          }}
        >
          {edge.label}
        </Text>
      ) : null}
    </>
  );
}

/** Three transparent borders and one solid one make a triangle. */
function Arrow({ at, color }: { at: NonNullable<LaidOutEdge["arrowAt"]>; color: string }) {
  const vertical = at.direction === "down" || at.direction === "up";
  const side = {
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderTopWidth: ARROW,
    borderBottomWidth: ARROW,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  };
  const filled =
    at.direction === "down"
      ? { borderTopColor: color, borderBottomWidth: 0 }
      : at.direction === "up"
        ? { borderBottomColor: color, borderTopWidth: 0 }
        : at.direction === "right"
          ? { borderLeftColor: color, borderRightWidth: 0 }
          : { borderRightColor: color, borderLeftWidth: 0 };

  return (
    <View
      style={[
        {
          position: "absolute",
          width: 0,
          height: 0,
          left: at.x - (vertical ? ARROW : at.direction === "right" ? ARROW : 0),
          top: at.y - (vertical ? (at.direction === "down" ? ARROW : 0) : ARROW),
        },
        side,
        filled,
      ]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Sequence                                                                     */
/* -------------------------------------------------------------------------- */

function SequenceView({
  diagram,
  theme,
}: {
  diagram: SequenceDiagram;
  theme: PluginTheme;
}) {
  const layout = layoutSequence(diagram.participants, diagram.events.length, diagram.events);
  const centers = new Map(layout.columns.map((column) => [column.id, column.centerX]));

  return (
    <View style={{ width: layout.width, height: layout.height, paddingBottom: 4 }}>
      {layout.columns.map((column) => (
        <React.Fragment key={column.id}>
          <View
            style={{
              position: "absolute",
              left: column.centerX - 0.75,
              top: layout.headerHeight,
              width: 1.5,
              height: layout.height - layout.headerHeight,
              backgroundColor: theme.colors.foregroundMuted,
              opacity: 0.4,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: column.centerX - column.width / 2,
              top: 0,
              width: column.width,
              height: 28,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.accent,
              borderRadius: column.actor ? 14 : 4,
              backgroundColor: theme.colors.surface0,
            }}
          >
            <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 12 }}>
              {column.label}
            </Text>
          </View>
        </React.Fragment>
      ))}

      {diagram.events.map((event, index) => (
        <EventView key={index} event={event} y={layout.rows[index].y} centers={centers} theme={theme} />
      ))}
    </View>
  );
}

function EventView({
  event,
  y,
  centers,
  theme,
}: {
  event: SeqEvent;
  y: number;
  centers: Map<string, number>;
  theme: PluginTheme;
}) {
  if (event.kind === "note") {
    const xs = event.over.map((id) => centers.get(id) ?? 0);
    const left = Math.min(...xs, 0);
    const right = Math.max(...xs, 0);
    return (
      <View
        style={{
          position: "absolute",
          left: left - 40,
          top: y + 6,
          width: Math.max(120, right - left + 80),
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.foregroundMuted,
          borderRadius: 4,
          backgroundColor: theme.colors.surface0,
        }}
      >
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, textAlign: "center" }}>{event.text}</Text>
      </View>
    );
  }

  const color = theme.colors.foregroundMuted;

  if (event.from === event.to) {
    // A message to oneself: a loop out of the lifeline and back, its label beside it.
    // The layout widened the drawing for that label (`layoutSequence`).
    const x = centers.get(event.from) ?? 0;
    return (
      <>
        <View
          style={{
            position: "absolute",
            left: x,
            top: y + 12,
            width: SELF_LOOP_WIDTH,
            height: 18,
            borderTopWidth: 1.5,
            borderRightWidth: 1.5,
            borderBottomWidth: 1.5,
            borderColor: color,
            opacity: event.style === "dashed" ? 0.45 : 1,
          }}
        />
        <Arrow at={{ x, y: y + 29.25, direction: "left" }} color={color} />
        <Text
          numberOfLines={1}
          style={{
            position: "absolute",
            left: x + SELF_LOOP_WIDTH + SELF_LABEL_GAP,
            top: y + 14,
            fontSize: 11,
            color: theme.colors.foreground,
          }}
        >
          {event.text}
        </Text>
      </>
    );
  }

  const from = centers.get(event.from) ?? 0;
  const to = centers.get(event.to) ?? 0;
  const forward = to >= from;
  const left = Math.min(from, to);
  const width = Math.max(Math.abs(to - from), 1);

  return (
    <>
      <Text
        numberOfLines={1}
        style={{
          position: "absolute",
          left,
          top: y + 2,
          width,
          textAlign: "center",
          fontSize: 11,
          color: theme.colors.foreground,
        }}
      >
        {event.text}
      </Text>
      <View
        style={{
          position: "absolute",
          left,
          top: y + 22,
          width,
          height: 1.5,
          backgroundColor: color,
          opacity: event.style === "dashed" ? 0.45 : 1,
        }}
      />
      <Arrow at={{ x: to, y: y + 22.75, direction: forward ? "right" : "left" }} color={color} />
    </>
  );
}
