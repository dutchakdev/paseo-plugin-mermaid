import type { PluginTheme } from "@getpaseo/plugin";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { parseMarkdown, type Block, type Inline } from "./markdown.shared";

/**
 * Renders the prose around a diagram.
 *
 * Taking over a timeline entry means Paseo's own Markdown no longer runs on it,
 * so this covers the formatting agents actually use next to a diagram. It is
 * deliberately small; anything richer belongs to Paseo, not to a plugin.
 */
export function Markdown({ text, theme, compact }: { text: string; theme: PluginTheme; compact: boolean }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View style={{ gap: compact ? 6 : 8 }}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} theme={theme} />
      ))}
    </View>
  );
}

function BlockView({ block, theme }: { block: Block; theme: PluginTheme }) {
  const body = { color: theme.colors.foreground, fontSize: 14, lineHeight: 20 };

  if (block.kind === "rule") {
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.foregroundMuted }} />;
  }

  if (block.kind === "code") {
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
          {block.text}
        </Text>
      </View>
    );
  }

  if (block.kind === "heading") {
    return (
      <Text selectable style={{ ...body, fontSize: 20 - block.level, fontWeight: "700" }}>
        <Spans content={block.content} theme={theme} />
      </Text>
    );
  }

  if (block.kind === "quote") {
    return (
      <View style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.accent, paddingLeft: 10 }}>
        <Text selectable style={{ ...body, color: theme.colors.foregroundMuted }}>
          <Spans content={block.content} theme={theme} />
        </Text>
      </View>
    );
  }

  if (block.kind === "bullet" || block.kind === "ordered") {
    return (
      <View style={{ gap: 3 }}>
        {block.items.map((item, index) => (
          <View key={index} style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ ...body, color: theme.colors.foregroundMuted }}>
              {block.kind === "bullet" ? "·" : `${block.start + index}.`}
            </Text>
            <Text selectable style={{ ...body, flex: 1 }}>
              <Spans content={item} theme={theme} />
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <Text selectable style={body}>
      <Spans content={block.content} theme={theme} />
    </Text>
  );
}

function Spans({ content, theme }: { content: Inline[]; theme: PluginTheme }) {
  return (
    <>
      {content.map((span, index) => {
        if (span.kind === "bold") return <Text key={index} style={{ fontWeight: "700" }}>{span.text}</Text>;
        if (span.kind === "italic") return <Text key={index} style={{ fontStyle: "italic" }}>{span.text}</Text>;
        if (span.kind === "code") {
          return (
            <Text key={index} style={{ fontFamily: "Menlo", fontSize: 12.5, color: theme.colors.accent }}>
              {span.text}
            </Text>
          );
        }
        return <Text key={index}>{span.text}</Text>;
      })}
    </>
  );
}
