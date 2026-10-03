import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LightningCard from '../../src/components/play/LightningCard';
import type { MentalProblem } from '../../src/engine/mental/types';

const q = (n: number, prompt: string, answer: MentalProblem['answer']): MentalProblem => ({
  id: `m:mm.fdp@1:1:${n}`,
  drill: 'mm.fdp',
  tier: 1,
  prompt,
  answer,
});
const questions = [
  q(1, '7/8 as a percent', { kind: 'number', value: '175/2', suffix: '%' }),
  q(2, '1/4 as a decimal', { kind: 'number', value: '1/4', form: 'decimal' }),
  q(3, '1/2 as a percent', { kind: 'number', value: '50', suffix: '%' }),
] as const;

describe('LightningCard', () => {
  it('shows the right answer in the asked-for form after a miss', () => {
    render(
      <LightningCard
        questions={questions}
        seconds={null}
        active
        result={undefined}
        onAnswer={() => 0}
        onDone={() => {}}
      />,
    );
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('status')).toHaveTextContent('✗ 87.5%');
  });
});
