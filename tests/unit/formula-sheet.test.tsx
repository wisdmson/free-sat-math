import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FormulaSheet from '../../src/components/FormulaSheet';

describe('FormulaSheet', () => {
  it('shows the four sections with rendered math', () => {
    const { container } = render(<FormulaSheet />);
    for (const title of [
      'Area and circumference',
      'Right triangles',
      'Volume',
      'Angles and arcs',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(10);
  });
});
