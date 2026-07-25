import { escapeHtml } from "./reportCharts";

/** Minimal markdown → HTML for the AI analysis text. Escapes first, so any raw
 * HTML in the model's response renders as text rather than executing. */
export function simpleMarkdownToHtml(markdown: string): string {
  const lines = escapeHtml(markdown).split(/\r?\n/);
  const parts: string[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      parts.push(`<ul>${listBuffer.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      listBuffer = [];
    }
  };

  const inlineFormat = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushList();
      parts.push("<hr />");
      return;
    }
    const headingMatch = /^(#{1,4})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushList();
      parts.push(`<h4>${inlineFormat(headingMatch[2])}</h4>`);
      return;
    }
    const bulletMatch = /^[-*]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      listBuffer.push(inlineFormat(bulletMatch[1]));
      return;
    }
    flushList();
    parts.push(`<p>${inlineFormat(line)}</p>`);
  });
  flushList();
  return parts.join("");
}
