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

const spr: Problem = {
  id: 'g:test@1:easy:spr:1',
  skill: 'alg.systems',
  difficulty: 'easy',
  format: 'spr',
  source: 'generated',
  stem: 'What is $6 \\cdot 2$?',
  answer: { kind: 'values', values: ['12'] },
  solution: ['Multiply.'],
};

describe('SatCard', () => {
  it('answers a typed question with the number pad', async () => {
    const onAnswer = vi.fn();
    render(
      <SatCard problem={spr} desmosKey={null} result={undefined} reduced onAnswer={onAnswer} />,
    );
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, response: '12' }),
    );
  });
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
  it('times an answer from when the card became current, not from when it was pre-rendered', async () => {
    const onAnswer = vi.fn();
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(1000);
    const { container, rerender } = render(
      <SatCard
        problem={mcq}
        desmosKey={null}
        result={undefined}
        reduced
        active={false}
        onAnswer={onAnswer}
      />,
    );
    clock.mockReturnValue(7000);
    rerender(
      <SatCard
        problem={mcq}
        desmosKey={null}
        result={undefined}
        reduced
        active
        onAnswer={onAnswer}
      />,
    );
    clock.mockReturnValue(7700);
    await userEvent.click(container.querySelector('[data-letter="B"]')!);
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ timeMs: 700 }));
    clock.mockRestore();
  });
  it('offers a Guessed? chip after answering, while it is open', async () => {
    const onGuessed = vi.fn();
    const answered = { correct: false, response: 'A', timeMs: 1, points: 0, multiplier: 1 };
    const props = {
      problem: mcq,
      desmosKey: null,
      result: answered,
      reduced: true,
      onAnswer: () => {},
    };
    const { rerender } = render(<SatCard {...props} chipOpen onGuessed={onGuessed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guessed?', pressed: false }));
    expect(onGuessed).toHaveBeenCalledWith(true);
    rerender(<SatCard {...props} chipOpen guessed onGuessed={onGuessed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guessed?', pressed: true }));
    expect(onGuessed).toHaveBeenLastCalledWith(false);
    rerender(<SatCard {...props} chipOpen={false} guessed onGuessed={onGuessed} />);
    expect(screen.queryByRole('button', { name: 'Guessed?' })).toBeNull();
    expect(screen.getByText('Marked as a guess')).toBeVisible();
  });
  it('shows no Guessed? chip before an answer', () => {
    render(
      <SatCard
        problem={mcq}
        desmosKey={null}
        result={undefined}
        reduced
        chipOpen
        onGuessed={() => {}}
        onAnswer={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Guessed?' })).toBeNull();
  });
  it('a pace check shows its target, then the time against it', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const onAnswer = vi.fn();
    const props = {
      problem: mcq,
      desmosKey: null,
      reduced: true,
      paceLimitMs: 95_000,
      onReset: () => {},
      onAnswer,
    };
    const { container, rerender } = render(<SatCard {...props} result={undefined} />);
    expect(screen.getByText('Pace check')).toBeVisible();
    expect(screen.getByText(/aim for 1:35/)).toBeVisible();
    clock.mockReturnValue(48_000);
    await userEvent.click(container.querySelector('[data-letter="B"]')!);
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ timeMs: 48_000 }));
    rerender(
      <SatCard
        {...props}
        result={{
          correct: true,
          response: 'B',
          timeMs: 48_000,
          points: 20,
          multiplier: 1,
          bonus: 10,
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('48 s · on pace ✅');
    expect(screen.getByRole('status')).toHaveTextContent('+10 pace bonus');
    rerender(
      <SatCard
        {...props}
        result={{ correct: false, response: 'A', timeMs: 130_000, points: 0, multiplier: 1 }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2:10 · over pace ⚠️');
    clock.mockRestore();
  });
  it('the Reset button on a pace check opens the reset routine', async () => {
    const onReset = vi.fn();
    render(
      <SatCard
        problem={mcq}
        desmosKey={null}
        result={undefined}
        reduced
        paceLimitMs={95_000}
        onReset={onReset}
        onAnswer={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
