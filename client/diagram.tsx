import type { PluginTheme } from "@getpaseo/plugin";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { parseFlowchart, type Flowchart, type NodeShape } from "../shared/flowchart";
import { namesADiagram } from "../shared/segment";
import {
  layoutFlowchart,
  layoutSequence,
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
    const box = layoutSequence(sequence.participants, sequence.events.length);
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

export function Unsupported({ source, theme }: { source: string; theme: PluginTheme }) {
  // The item is claimed as soon as the fence opens, so most of the time this is a
  // diagram halfway through arriving rather than one this plugin cannot draw.
  // Saying "unsupported" about unfinished source would be a lie that flashes on
  // screen every time.
  const arriving = namesADiagram(source);
  return (
    <View
      style={{
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.foregroundMuted,
        padding: 10,
        gap: 6,
      }}
    >
      {arriving ? null : (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
          This plugin draws flowchart and sequenceDiagram. Showing the source instead.
        </Text>
      )}
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
  const layout = layoutSequence(diagram.participants, diagram.events.length);
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

  const from = centers.get(event.from) ?? 0;
  const to = centers.get(event.to) ?? 0;
  const forward = to >= from;
  const left = Math.min(from, to);
  const width = Math.max(Math.abs(to - from), 1);
  const color = theme.colors.foregroundMuted;

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
