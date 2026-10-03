import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  it('picks up where it left off when it comes back on screen', () => {
    render(
      <LightningCard
        questions={questions}
        seconds={null}
        active
        result={{ done: false, right: 1, answered: 2 }}
        onAnswer={() => 0}
        onDone={() => {}}
      />,
    );
    expect(screen.getByText('2 of 3 done')).toBeVisible();
    expect(document.querySelector('[data-mental-id]')).toHaveAttribute(
      'data-mental-id',
      questions[2].id,
    );
  });
  it('moves focus to the next question after an answer', () => {
    vi.useFakeTimers();
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
    act(() => vi.advanceTimersByTime(800));
    expect(document.activeElement).toHaveAttribute('data-mental-id', questions[1].id);
    vi.useRealTimers();
  });
});
