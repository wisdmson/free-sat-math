import { useMemo } from 'react';
import { blockHtml, inlineHtml } from '../lib/math-html';

interface Props {
  text: string;
  /** Wrap paragraphs in <p> inside a <div>. Otherwise renders a <span>. */
  block?: boolean;
  className?: string;
}

/** Text with $math$, rendered by KaTeX. All text is HTML-escaped first. */
export default function MathText({ text, block = false, className }: Props) {
  const html = useMemo(() => (block ? blockHtml(text) : inlineHtml(text)), [text, block]);
  return block ? (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
