import type { PluginTimelineItemProps } from "@getpaseo/plugin";
import React from "react";
import { View } from "react-native";
import { Diagram } from "./diagram.client";
import { Markdown } from "./markdown.client";

export interface TextData {
  text: string;
}

export interface DiagramData {
  source: string;
}

export function TextItem({ item, theme, layout }: PluginTimelineItemProps<TextData>) {
  return <Markdown text={item.data.text} theme={theme} compact={layout.compact} />;
}

export function DiagramItem({ item, theme, layout }: PluginTimelineItemProps<DiagramData>) {
  return (
    <View style={{ paddingVertical: 4 }}>
      <Diagram source={item.data.source} theme={theme} compact={layout.compact} />
    </View>
  );
}
