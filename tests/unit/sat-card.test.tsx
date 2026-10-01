import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SatCard from '../../src/components/play/SatCard';
import type { Problem } from '../../src/engine/problem';

const mcq: Problem = {
  id: 'g:test@1:easy:mcq:1',
  skill: 'alg.systems',
  difficulty: 'easy',
  format: 'mcq',
  source: 'generated',
  stem: 'What is $1 + 1$?',
  choices: [{ text: '$1$' }, { text: '$2$' }, { text: '$3$' }, { text: '$4$' }],
  answer: { kind: 'choice', index: 1 },
  solution: ['Add.'],
};

describe('SatCard', () => {
  it('answers with one tap and reports the result', async () => {
    const onAnswer = vi.fn();
    const { container } = render(
      <SatCard problem={mcq} desmosKey={null} result={undefined} reduced onAnswer={onAnswer} />,
    );
    await userEvent.click(container.querySelector('[data-letter="B"]')!);
    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, response: 'B' }),
    );
  });
  it('a second tap after answering does nothing', async () => {
    const onAnswer = vi.fn();
    const { container } = render(
      <SatCard problem={mcq} desmosKey={null} result={undefined} reduced onAnswer={onAnswer} />,
    );
    await userEvent.click(container.querySelector('[data-letter="A"]')!);
    await userEvent.click(container.querySelector('[data-letter="B"]')!);
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });
  it('shows the result, the answer and a Why? button once answered', async () => {
    render(
      <SatCard
        problem={mcq}
        desmosKey={null}
        result={{ correct: false, response: 'A', timeMs: 1, points: 0, multiplier: 1 }}
        reduced
        onAnswer={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
    await userEvent.click(screen.getByRole('button', { name: 'Why?' }));
    // Solution is lazy-loaded, so wait for it.
    expect(await screen.findByRole('region', { name: 'Solution' })).toBeVisible();
  });
});
