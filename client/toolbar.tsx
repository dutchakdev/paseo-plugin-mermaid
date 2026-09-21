import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { toolbarState, zoomLabel } from "../shared/zoom";

/**
 * The controls above a drawing: the zoom steps, the percent, fit to view, pop
 * out, and the source toggle. Paseo's own diagram box offers the same set on
 * hover; this row is always visible so it is reachable on touch. In the compact
 * layout the labels drop and the icons and the percent stay, so the row still
 * fits a phone.
 */

export interface ToolbarProps {
  theme: PluginTheme;
  compact: boolean;
  zoom: number;
  /** The zoom "Fit to view" would set; the button goes quiet once it is there. */
  fitZoom: number;
  showCode: boolean;
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  onToggleCode(): void;
  /** Absent inside the pop-out, where there is nowhere further to go. */
  onPopOut?(): void;
}

export function Toolbar({
  theme,
  compact,
  zoom,
  fitZoom,
  showCode,
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleCode,
  onPopOut,
}: ToolbarProps) {
  const enabled = toolbarState({ zoom, fitZoom, showCode });
  const button = { theme, compact };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <ToolButton {...button} icon="ZoomOut" label="Zoom out" onPress={onZoomOut} disabled={!enabled.zoomOut} />
        <Text
          style={{
            minWidth: 40,
            textAlign: "center",
            fontSize: 12,
            // Digits of equal width, so 80% → 100% → 125% does not nudge the buttons.
            fontVariant: ["tabular-nums"],
            color: theme.colors.foregroundMuted,
            opacity: showCode ? 0.4 : 1,
          }}
        >
          {zoomLabel(zoom)}
        </Text>
        <ToolButton {...button} icon="ZoomIn" label="Zoom in" onPress={onZoomIn} disabled={!enabled.zoomIn} />
        <ToolButton {...button} icon="Scan" label="Fit to view" onPress={onFit} disabled={!enabled.fit} />
        {onPopOut ? (
          <ToolButton {...button} icon="Maximize2" label="Pop out" onPress={onPopOut} disabled={!enabled.popOut} />
        ) : null}
      </View>
      <ToolButton
        {...button}
        icon={showCode ? "Workflow" : "Code"}
        label={showCode ? "Show diagram" : "Show code"}
        onPress={onToggleCode}
      />
    </View>
  );
}

/** `pressed` is what React Native reports; `hovered` arrives on web only. */
interface PressState {
  pressed: boolean;
  hovered?: boolean;
}

function ToolButton({
  theme,
  compact,
  icon,
  label,
  onPress,
  disabled = false,
}: {
  theme: PluginTheme;
  compact: boolean;
  icon: string;
  label: string;
  onPress(): void;
  disabled?: boolean;
}) {
  // The visible button is shorter than a comfortable target; the slop brings
  // the hit area to 40px on desktop and 44px on touch without touching the
  // neighbour, since the row gap is wider than two horizontal slops.
  const height = compact ? 32 : 28;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        height,
        paddingHorizontal: compact ? 9 : 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: (hovered || pressed) && !disabled ? theme.colors.surface2 : theme.colors.surface1,
        opacity: disabled ? 0.4 : 1,
        transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
      })}
    >
      {({ hovered }: PressState) => (
        <>
          <Icon
            name={icon}
            size={14}
            color={hovered && !disabled ? theme.colors.foreground : theme.colors.foregroundMuted}
          />
          {compact ? null : <Text style={{ fontSize: 12, color: theme.colors.foreground }}>{label}</Text>}
        </>
      )}
    </Pressable>
  );
}
