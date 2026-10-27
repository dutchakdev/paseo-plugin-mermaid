import { type PluginFilePanelProps, useFileText } from "@getpaseo/plugin/client";
import { Loading, Markdown } from "@getpaseo/plugin/client/ui";
import React from "react";
import { ScrollView, Text } from "react-native";
import { fileView } from "../shared/file-view";
import { DiagramViewer } from "./viewer";

/**
 * Draws a `.mmd` file in its file tab and redraws it when the file changes on disk,
 * so a diagram an agent is editing updates in place. A diagram this plugin does not
 * draw in full goes to Paseo's Markdown, which renders it with Mermaid.
 *
 * Registered only on apps with file panels (Paseo 0.13 and later, see `compat`),
 * which also have `useFileText`, `Loading` and `Markdown`.
 */
export function MermaidFilePanel({ file, theme, layout }: PluginFilePanelProps) {
  const text = useFileText(file);
  const padding = layout.compact ? 12 : 20;
  if (text.status === "loading") return <Loading />;
  if (text.status === "error") {
    return <Text style={{ color: theme.colors.statusDanger, padding }}>{text.error.message}</Text>;
  }

  const view = fileView(text.text);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding }}>
      {view.kind === "diagram" ? (
        <DiagramViewer source={view.source} theme={theme} compact={layout.compact} />
      ) : view.kind === "markdown" ? (
        <Markdown>{view.markdown}</Markdown>
      ) : (
        <Text style={{ color: theme.colors.foregroundMuted }}>This file is empty.</Text>
      )}
    </ScrollView>
  );
}
