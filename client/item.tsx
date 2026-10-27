import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import * as ui from "@getpaseo/plugin/client/ui";
import React from "react";
import { View } from "react-native";
import { hostMarkdown } from "./compat";
import { Markdown } from "./markdown";
import { DiagramViewer } from "./viewer";

/** Paseo's own Markdown on apps from 0.13; older apps get the plugin's limited renderer. */
const HostMarkdown = hostMarkdown(ui);

export interface TextData {
  text: string;
  /** The message's link reference definitions, for links in this item defined in another. */
  definitions?: string;
}

export interface DiagramData {
  source: string;
}

export function TextItem({ item, theme, layout }: PluginTimelineItemProps<TextData>) {
  // The prose around a diagram then reads like the rest of the chat: links, tables, highlighted code.
  if (HostMarkdown) {
    const { text, definitions } = item.data;
    return <HostMarkdown>{definitions ? `${text}\n\n${definitions}` : text}</HostMarkdown>;
  }
  return <Markdown text={item.data.text} theme={theme} compact={layout.compact} />;
}

export function DiagramItem({ item, theme, layout }: PluginTimelineItemProps<DiagramData>) {
  return (
    <View style={{ paddingVertical: 4 }}>
      <DiagramViewer source={item.data.source} theme={theme} compact={layout.compact} />
    </View>
  );
}
