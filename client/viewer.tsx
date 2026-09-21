import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, ScrollView as SheetScrollView } from "@getpaseo/plugin/client/react-native";
import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from "react-native";
import { fitScale, overflowsAfterFit } from "../shared/layout";
import { fitBothScale, fitRowZoom, zoomIn, zoomOut, type Size } from "../shared/zoom";
import { Drawing, naturalSize, parseDiagram, Unsupported, type DrawableDiagram } from "./diagram";
import { Toolbar } from "./toolbar";

/**
 * Puts a drawing on screen at the size the reader wants.
 *
 * The drawing itself is laid out once at its natural size; everything here is
 * about where it goes and how big. In the row it is fitted to the width it was
 * given and the reader zooms from there. Popped out, it is fitted to the window
 * instead. Both keep their own zoom, because 100% means something different in
 * each, and both can swap the drawing for its source.
 */

/** Narrower than this is a measurement artefact, not a row anyone can read in. */
const MIN_MEASURABLE = 120;
/** Kept clear around the drawing in the pop-out, so it never touches the edges. */
const POP_OUT_PADDING = 16;

export function DiagramViewer({ source, theme, compact }: { source: string; theme: PluginTheme; compact: boolean }) {
  const parsed = useMemo(() => parseDiagram(source), [source]);
  const [popped, setPopped] = useState(false);

  if (parsed.kind === "unsupported") {
    // Showing the source beats drawing a guess at what it meant.
    return <Unsupported source={source} theme={theme} />;
  }

  return (
    <View style={{ gap: 6 }}>
      <RowViewer parsed={parsed} source={source} theme={theme} compact={compact} onPopOut={() => setPopped(true)} />
      {parsed.kind === "flow" && parsed.skipped.length > 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
          {parsed.skipped.length} line{parsed.skipped.length === 1 ? "" : "s"} not drawn: subgraphs and styling are
          not supported yet.
        </Text>
      ) : null}
      {popped ? (
        <PopOut parsed={parsed} source={source} theme={theme} compact={compact} onClose={() => setPopped(false)} />
      ) : null}
    </View>
  );
}

/**
 * The drawing in the transcript row.
 *
 * The row is measured, the drawing is fitted to it (grown a little when small,
 * shrunk no further than the labels stay readable), and the zoom multiplies
 * that. Zooming in makes the row taller and, past the row's width, scrolls it
 * sideways; the transcript itself scrolls vertically, so nothing is clipped.
 */
function RowViewer({
  parsed,
  source,
  theme,
  compact,
  onPopOut,
}: {
  parsed: DrawableDiagram;
  source: string;
  theme: PluginTheme;
  compact: boolean;
  onPopOut(): void;
}) {
  const natural = naturalSize(parsed);
  const [available, setAvailable] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showCode, setShowCode] = useState(false);

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    // A first pass can report a width the row does not really have, while the
    // parent is still deriving its own size. Treating that as real is what made
    // a freshly arrived diagram render narrow until something forced a reload.
    if (measured < MIN_MEASURABLE) return;
    if (measured !== available) setAvailable(measured);
  };

  const rowScale = fitScale(available, natural.width);
  const fitZoom = fitRowZoom(rowScale, natural.width, available);
  const scale = rowScale * zoom;
  const box = { width: Math.floor(natural.width * scale), height: Math.floor(natural.height * scale) };
  const scrolls = overflowsAfterFit(available, natural.width, zoom);

  const scaled = <Scaled parsed={parsed} natural={natural} scale={scale} box={box} theme={theme} />;

  return (
    <View style={{ gap: 8 }}>
      <Toolbar
        theme={theme}
        compact={compact}
        zoom={zoom}
        fitZoom={fitZoom}
        showCode={showCode}
        onZoomIn={() => setZoom(zoomIn)}
        onZoomOut={() => setZoom(zoomOut)}
        onFit={() => setZoom(fitZoom)}
        onToggleCode={() => setShowCode((shown) => !shown)}
        onPopOut={onPopOut}
      />
      <View style={{ alignSelf: "stretch" }}>
        {/*
          The measurement happens on a probe, not on the container that holds the
          drawing. Measuring the container would close a loop: its height comes
          from the scale, the scale comes from the measurement, and a view whose
          size depends on its own measurement can settle on a wrong value and then
          never be laid out again. The probe is always the full width of the row
          and never changes, so every change in the row reaches it.
        */}
        <View onLayout={onLayout} style={{ alignSelf: "stretch", height: 0 }} />
        {showCode ? (
          <Source source={source} theme={theme} />
        ) : (
          <View style={{ alignSelf: "stretch", height: box.height }}>
            {scrolls ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={!compact} style={{ height: box.height }}>
                {scaled}
              </ScrollView>
            ) : (
              scaled
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * The drawing in a host modal.
 *
 * Here 100% means fitted to the window on both axes, which grows a small
 * drawing as far as the window allows: seeing it large is what popping out is
 * for. Past the window the drawing scrolls on both axes rather than being
 * panned, since a scroll view is something every platform here already has.
 */
function PopOut({
  parsed,
  source,
  theme,
  compact,
  onClose,
}: {
  parsed: DrawableDiagram;
  source: string;
  theme: PluginTheme;
  compact: boolean;
  onClose(): void;
}) {
  const natural = naturalSize(parsed);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [showCode, setShowCode] = useState(false);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const next = { width: Math.round(width), height: Math.round(height) };
    if (next.width < MIN_MEASURABLE || next.height < MIN_MEASURABLE) return;
    if (next.width !== viewport.width || next.height !== viewport.height) setViewport(next);
  };

  const scale = fitBothScale(natural, viewport, POP_OUT_PADDING) * zoom;
  const box = { width: Math.floor(natural.width * scale), height: Math.floor(natural.height * scale) };

  return (
    <Modal
      title="Diagram"
      icon={<Icon name="Workflow" size={16} color={theme.colors.foregroundMuted} />}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Content scrollable={false} style={{ flex: 1 }} contentContainerStyle={{ flex: 1, padding: 0, gap: 0 }}>
        <View style={{ flex: 1, minHeight: 0, gap: 8, padding: compact ? 12 : 16 }}>
          <Toolbar
            theme={theme}
            compact={compact}
            zoom={zoom}
            fitZoom={1}
            showCode={showCode}
            onZoomIn={() => setZoom(zoomIn)}
            onZoomOut={() => setZoom(zoomOut)}
            onFit={() => setZoom(1)}
            onToggleCode={() => setShowCode((shown) => !shown)}
          />
          <View style={{ flex: 1, minHeight: 0 }} onLayout={onLayout}>
            {showCode ? (
              <SheetScrollView style={{ flex: 1 }}>
                <Source source={source} theme={theme} />
              </SheetScrollView>
            ) : (
              <SheetScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={!compact}
                  style={{ alignSelf: "stretch" }}
                  contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: POP_OUT_PADDING }}
                >
                  <Scaled parsed={parsed} natural={natural} scale={scale} box={box} theme={theme} />
                </ScrollView>
              </SheetScrollView>
            )}
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}

/** The drawing at natural size inside a box of its scaled size, so layout sees the scaled one. */
function Scaled({
  parsed,
  natural,
  scale,
  box,
  theme,
}: {
  parsed: DrawableDiagram;
  natural: Size;
  scale: number;
  box: Size;
  theme: PluginTheme;
}) {
  return (
    <View style={box}>
      <View style={{ width: natural.width, height: natural.height, transform: [{ scale }], transformOrigin: "top left" }}>
        <Drawing parsed={parsed} theme={theme} />
      </View>
    </View>
  );
}

function Source({ source, theme }: { source: string; theme: PluginTheme }) {
  return (
    <View
      style={{
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        padding: 10,
      }}
    >
      <Text selectable style={{ color: theme.colors.foreground, fontFamily: "Menlo", fontSize: 12, lineHeight: 18 }}>
        {source}
      </Text>
    </View>
  );
}
