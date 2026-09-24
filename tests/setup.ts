import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom's getComputedStyle throws on MathML elements, which KaTeX emits for screen readers.
// Accessible-name queries call it to check visibility, so give MathML elements default styles.
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const realGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((elt: Element, pseudoElt?: string | null) =>
  realGetComputedStyle(
    elt.namespaceURI === MATHML_NS ? document.createElement('span') : elt,
    pseudoElt,
  )) as typeof window.getComputedStyle;
