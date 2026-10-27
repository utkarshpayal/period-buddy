import test from "node:test";
import assert from "node:assert/strict";
import { hasRichMarkup, parseChartSpec, richPalette, richTextPlugin, richTextToPlain } from "../richText";
import { cleanForSpeech } from "../voiceSpeech";

type Tok = { type: string; attrs: [string, string][] | null; children: Tok[] };
type Md = Parameters<typeof richTextPlugin>[0] & {
  parse: (src: string, env: object) => Tok[];
  parseInline: (src: string, env: object) => Tok[];
};
// markdown-it (react-native-markdown-display's parser) ships without types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MarkdownIt: (options: object) => Md = require("markdown-it");

const md = () => {
  const instance = MarkdownIt({ html: true });
  richTextPlugin(instance, richPalette(false));
  return instance;
};

const inlineTypes = (text: string) =>
  md()
    .parseInline(text, {})[0]
    .children.map((t: Tok) => t.type);

test("allowlisted tags become rich tokens with the theme's colors", () => {
  const [line] = md().parseInline('<span data-color="rose">hi **there**</span> <mark data-color="pink">m</mark> <u>u</u>', {});
  const types = line.children.map((t: Tok) => t.type);
  assert.deepEqual(types.filter((t) => t.startsWith("rich_")), [
    "rich_color_open",
    "rich_color_close",
    "rich_mark_open",
    "rich_mark_close",
    "rich_u_open",
    "rich_u_close",
  ]);
  const color = line.children.find((t: Tok) => t.type === "rich_color_open");
  assert.deepEqual(color?.attrs, [["style", "color: #C2416F"]]);
  const mark = line.children.find((t: Tok) => t.type === "rich_mark_open");
  assert.deepEqual(mark?.attrs, [["data-bg", "#FCE1EC"]]);
});

test("unknown colors and other HTML are dropped, text kept, tree balanced", () => {
  const types = inlineTypes('<span data-color="hotpink">a</span> <b onclick="x">b</b> <span data-color="teal">c');
  assert.ok(!types.includes("html_inline"));
  assert.equal(types.filter((t) => t === "rich_color_open").length, 1);
  assert.equal(types.filter((t) => t === "rich_color_close").length, 1);
  const blocks = md().parse("<div>\n<script>alert(1)</script>\n</div>\n\nok", {});
  assert.ok(!blocks.some((t: Tok) => t.type === "html_block"));
});

test("dark theme uses lighter text colors", () => {
  const instance = MarkdownIt({ html: true });
  richTextPlugin(instance, richPalette(true));
  const color = instance.parseInline('<span data-color="rose">x</span>', {})[0].children[0];
  assert.deepEqual(color?.attrs, [["style", "color: #F28CB1"]]);
});

test("parseChartSpec reads valid charts and rejects broken ones", () => {
  const spec = parseChartSpec('{"type":"line","labels":["A","B"],"series":[{"name":"S","values":[1,"2"]}]}');
  assert.deepEqual(spec?.series[0].values, [1, 2]);
  assert.equal(parseChartSpec('{"type":"radar","labels":["A"],"series":[]}'), null);
  assert.equal(parseChartSpec("not json"), null);
});

test("plain text and speech skip charts, images and tags", () => {
  const content = 'Hi <span data-color="rose">there</span>.\n\n```chart\n{"type":"bar"}\n```\n\n![A bag](https://x.y/a.jpg "Cap")';
  assert.equal(richTextToPlain(content), "Hi there.");
  assert.equal(cleanForSpeech(content), "Hi there.");
  assert.equal(hasRichMarkup("Just words, nothing else."), false);
  assert.equal(hasRichMarkup("Some **bold**"), true);
});
