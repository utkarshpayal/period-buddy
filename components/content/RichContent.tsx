import React, { useMemo, useState } from "react";
import { Linking, Text, View, type TextStyle } from "react-native";
import { Image } from "expo-image";
import Markdown, { MarkdownIt, renderRules, type ASTNode } from "react-native-markdown-display";
import { parseChartSpec, richPalette, richTextPlugin } from "../../lib/richText";
import { useTheme } from "../theme";
import { RichChart } from "./RichChart";

const SITE_URL = "https://thenura.care";

// One parser per theme: the plugin bakes the palette's colors into the tokens.
const parsers: Partial<Record<"light" | "dark", ReturnType<typeof MarkdownIt>>> = {};
function richParser(isDark: boolean) {
  const key = isDark ? "dark" : "light";
  if (!parsers[key]) {
    const md = MarkdownIt({ html: true, typographer: true });
    richTextPlugin(md, richPalette(isDark));
    parsers[key] = md;
  }
  return parsers[key]!;
}

/** Links to the website's own pages ("/blog/…") open on the site. */
function onLinkPress(url: string) {
  if (url.startsWith("/")) {
    Linking.openURL(`${SITE_URL}${url}`).catch(() => {});
    return false;
  }
  return true;
}

function RichImage({ src, alt, title }: { src: string; alt: string; title?: string }) {
  const { colors, fonts } = useTheme();
  const [ratio, setRatio] = useState(16 / 9);
  return (
    <View style={{ width: "100%", marginVertical: 10 }}>
      <Image
        source={{ uri: src }}
        accessibilityLabel={alt || undefined}
        accessible={!!alt}
        contentFit="cover"
        transition={150}
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width && height) setRatio(width / height);
        }}
        style={{ width: "100%", aspectRatio: ratio, borderRadius: 16, backgroundColor: colors.surfaceSoft }}
      />
      {title ? (
        <Text style={{ marginTop: 6, color: colors.mutedText, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 }}>{title}</Text>
      ) : null}
    </View>
  );
}

const rules = {
  rich_color: (node: ASTNode, children: React.ReactNode[]) => <Text key={node.key}>{children}</Text>,
  rich_u: (node: ASTNode, children: React.ReactNode[]) => <Text key={node.key}>{children}</Text>,
  rich_mark: (node: ASTNode, children: React.ReactNode[]) => (
    <Text key={node.key} style={{ backgroundColor: (node.attributes as Record<string, string>)["data-bg"] }}>
      {children}
    </Text>
  ),
  image: (node: ASTNode) => {
    const attrs = node.attributes as Record<string, string>;
    if (!/^https?:\/\//i.test(attrs.src ?? "")) return null;
    return <RichImage key={node.key} src={attrs.src} alt={attrs.alt ?? ""} title={attrs.title} />;
  },
  fence: (node: ASTNode, children: React.ReactNode[], parent: ASTNode[], styles: any, inheritedStyles: any) => {
    if ((node as ASTNode & { sourceInfo?: string }).sourceInfo?.trim() === "chart") {
      const spec = parseChartSpec(node.content);
      return spec ? <RichChart key={node.key} spec={spec} /> : null;
    }
    return renderRules.fence?.(node, children, parent, styles, inheritedStyles);
  },
};

export type RichContentSize = "article" | "compact";

/**
 * Rich content (lib/richText.ts) as native views: Markdown, the color /
 * highlight / underline allowlist, images with captions, tables and charts.
 * "article" is the blog reader's type scale; "compact" suits cards and chat.
 */
export function RichContent({ content, size = "article", color }: { content: string; size?: RichContentSize; color?: string }) {
  const { colors, fonts, isDark } = useTheme();
  const compact = size === "compact";
  const text = color ?? colors.foreground;

  // Stable between renders: a new object makes Markdown re-parse the whole text.
  const styles = useMemo(() => ({
    body: { color: text, fontFamily: fonts.body, fontSize: compact ? 15 : 16, lineHeight: compact ? 22 : 26, fontWeight: "400" as const },
    paragraph: { marginTop: 0, marginBottom: compact ? 8 : 14 },
    heading1: { color: text, fontFamily: fonts.heading, fontSize: compact ? 18 : 22, lineHeight: compact ? 24 : 29, fontWeight: "800" as const, marginTop: compact ? 12 : 24, marginBottom: compact ? 6 : 10 },
    heading2: { color: text, fontFamily: fonts.heading, fontSize: compact ? 16 : 18, lineHeight: compact ? 22 : 25, fontWeight: "700" as const, marginTop: compact ? 12 : 24, marginBottom: compact ? 4 : 8 },
    heading3: { color: text, fontFamily: fonts.heading, fontSize: compact ? 15 : 16, lineHeight: compact ? 21 : 23, fontWeight: "700" as const, marginTop: compact ? 10 : 18, marginBottom: compact ? 4 : 6 },
    heading4: { color: text, fontFamily: fonts.heading, fontSize: compact ? 15 : 16, lineHeight: compact ? 21 : 23, fontWeight: "700" as const, marginTop: compact ? 10 : 14, marginBottom: compact ? 4 : 6 },
    strong: { fontWeight: "700" as const },
    em: { fontStyle: "italic" as const },
    s: { textDecorationLine: "line-through" as const },
    bullet_list: { marginBottom: compact ? 8 : 14 },
    ordered_list: { marginBottom: compact ? 8 : 14 },
    list_item: { marginBottom: compact ? 4 : 6 },
    bullet_list_icon: { color: colors.primaryDark, fontWeight: "800" as const, marginLeft: 2, marginRight: 10 },
    ordered_list_icon: { color: colors.primaryDark, fontWeight: "700" as const, marginRight: 8 },
    link: { color: colors.primaryDark, fontWeight: "600" as const, textDecorationLine: "underline" as const },
    blockquote: {
      backgroundColor: colors.surfaceSoft,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginVertical: 8,
      marginLeft: 0,
    },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 18 },
    code_inline: { backgroundColor: colors.surfaceSoft, color: text, borderRadius: 4, paddingHorizontal: 4 },
    fence: { backgroundColor: colors.surfaceSoft, color: text, borderColor: colors.border, borderRadius: 8, fontFamily: fonts.mono },
    table: { borderColor: colors.border, borderRadius: 8, marginBottom: compact ? 8 : 14 },
    thead: { backgroundColor: colors.surfaceSoft },
    th: { padding: 8 },
    td: { padding: 8 },
    tr: { borderColor: colors.border },
  }), [colors, fonts, text, compact]);

  return (
    <Markdown style={styles} rules={rules} markdownit={richParser(isDark)} onLinkPress={onLinkPress}>
      {content}
    </Markdown>
  );
}

type InlineToken = { type: string; content: string; attrs: [string, string][] | null; children: InlineToken[] | null };

const attr = (token: InlineToken, name: string) => token.attrs?.find(([k]) => k === name)?.[1];

/**
 * One line of rich text inside a single <Text>: bold, italic, strike, links,
 * colors, highlight and underline, but no blocks. For the one-point-per-line
 * fields (guide points, symptoms, care steps) that the app shows as cards.
 */
export function RichInline({ text, style, numberOfLines }: { text: string; style?: TextStyle | TextStyle[]; numberOfLines?: number }) {
  const { colors, fonts, isDark } = useTheme();

  const nodes = useMemo(() => {
    // Most points are plain: skip parsing them.
    if (!/[*_~`[<\\]/.test(text)) return [text];
    const [line] = richParser(isDark).parseInline(text, {}) as InlineToken[];
    const frames: { style: TextStyle; href?: string; children: React.ReactNode[] }[] = [{ style: {}, children: [] }];
    let key = 0;
    const push = (node: React.ReactNode) => frames[frames.length - 1].children.push(node);

    for (const token of line?.children ?? []) {
      if (token.type.endsWith("_open")) {
        const kind = token.type.slice(0, -5);
        const color = attr(token, "style")?.match(/^color:\s*(#[0-9a-f]{3,8})$/i)?.[1];
        const style: TextStyle =
          kind === "strong" ? { fontWeight: "700" }
          : kind === "em" ? { fontStyle: "italic" }
          : kind === "s" ? { textDecorationLine: "line-through" }
          : kind === "rich_u" ? { textDecorationLine: "underline" }
          : kind === "rich_color" && color ? { color }
          : kind === "rich_mark" ? { backgroundColor: attr(token, "data-bg") }
          : kind === "link" ? { color: colors.primaryDark, fontWeight: "600", textDecorationLine: "underline" }
          : {};
        frames.push({ style, href: kind === "link" ? attr(token, "href") : undefined, children: [] });
      } else if (token.type.endsWith("_close")) {
        if (frames.length < 2) continue;
        const frame = frames.pop()!;
        const href = frame.href;
        push(
          <Text
            key={key++}
            style={frame.style}
            onPress={href ? () => (onLinkPress(href) ? Linking.openURL(href).catch(() => {}) : undefined) : undefined}
            accessibilityRole={href ? "link" : undefined}
          >
            {frame.children}
          </Text>,
        );
      } else if (token.type === "code_inline") {
        push(<Text key={key++} style={{ fontFamily: fonts.mono, backgroundColor: colors.surfaceSoft }}>{token.content}</Text>);
      } else if (token.type === "softbreak" || token.type === "hardbreak") {
        push(" ");
      } else if (token.type === "image") {
        push(attr(token, "alt") ?? "");
      } else if (token.content) {
        push(token.content);
      }
    }
    // Unclosed frames (shouldn't happen): keep their text.
    while (frames.length > 1) {
      const frame = frames.pop()!;
      push(<Text key={key++} style={frame.style}>{frame.children}</Text>);
    }
    return frames[0].children;
  }, [text, isDark, colors, fonts]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {nodes}
    </Text>
  );
}
