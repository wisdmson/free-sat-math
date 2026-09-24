import { describe, expect, it, vi } from 'vitest';
import { blockHtml, escapeHtml, inlineHtml } from '../../src/lib/math-html';

describe('math-html', () => {
  it('escapes text and renders math with MathML for screen readers', () => {
    const html = inlineHtml('If <b> then $x^2$');
    expect(html.startsWith('If &lt;b&gt; then ')).toBe(true);
    expect(html).toContain('class="katex"');
    expect(html).toContain('<math');
  });
  it('keeps punctuation after math on the same line', () => {
    const html = inlineHtml('the value of $k$?');
    expect(html.startsWith('the value of <span class="nowrap"><span class="katex">')).toBe(true);
    expect(html.endsWith('?</span>')).toBe(true);
    expect(inlineHtml('$x$, then $y$')).toMatch(/,<\/span> then /);
  });
  it('turns \\$ into a dollar sign', () => {
    expect(inlineHtml('costs \\$5')).toBe('costs $5');
  });
  it('wraps paragraphs', () => {
    expect(blockHtml('one\n\ntwo')).toBe('<p>one</p><p>two</p>');
  });
  it('falls back to escaped source when KaTeX fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(inlineHtml('$\\notacommand{<}$')).toBe(
      '<code class="math-fallback">\\notacommand{&lt;}</code>',
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('falls back to plain escaped text when a $ is unclosed', () => {
    expect(inlineHtml('a $ b <c>')).toBe('a $ b &lt;c&gt;');
  });
  it('escapes all five HTML characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
