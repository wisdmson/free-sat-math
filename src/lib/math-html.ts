import katex from 'katex';
import { paragraphs, splitMath } from '../engine/markup';

const cache = new Map<string, string>();

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] as string);

function renderMath(latex: string, display: boolean): string {
  const key = `${display ? 'D' : 'I'}${latex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = katex.renderToString(latex, {
      displayMode: display,
      throwOnError: true,
      output: 'htmlAndMathml',
    });
  } catch (err) {
    console.warn('[math] KaTeX could not render', latex, err);
    html = `<code class="math-fallback">${escapeHtml(latex)}</code>`;
  }
  cache.set(key, html);
  return html;
}

const TRAILING_PUNCTUATION = /^[.,;:!?)]+/;

/**
 * HTML for one run of text with $math$ (no paragraph wrapper). Text is escaped.
 * Punctuation right after math is kept on the same line as the math.
 */
export function inlineHtml(source: string): string {
  let segments;
  try {
    segments = splitMath(source);
  } catch {
    return escapeHtml(source);
  }
  const out: string[] = [];
  let skip = 0;
  segments.forEach((seg, i) => {
    if (seg.kind === 'text') {
      out.push(escapeHtml(seg.value.slice(skip)));
      skip = 0;
      return;
    }
    const next = segments[i + 1];
    const punct =
      next?.kind === 'text' && !seg.display
        ? TRAILING_PUNCTUATION.exec(next.value)?.[0]
        : undefined;
    const math = renderMath(seg.value, seg.display);
    if (punct === undefined) {
      out.push(math);
    } else {
      out.push(`<span class="nowrap">${math}${escapeHtml(punct)}</span>`);
      skip = punct.length;
    }
  });
  return out.join('');
}

/** HTML with each paragraph (split on blank lines) wrapped in <p>. */
export function blockHtml(source: string): string {
  return paragraphs(source)
    .map((p) => `<p>${inlineHtml(p)}</p>`)
    .join('');
}
