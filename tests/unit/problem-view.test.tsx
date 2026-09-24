import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProblemView from '../../src/components/ProblemView';
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
  solution: ['Add: $1 + 1 = 2$.'],
  distractorNotes: { A: 'Forgot to add.', C: 'Added one too many.', D: 'Doubled twice.' },
};

const spr: Problem = {
  id: 'g:test@1:easy:spr:1',
  skill: 'alg.systems',
  difficulty: 'easy',
  format: 'spr',
  source: 'generated',
  stem: 'What is $7 \\div 2$?',
  answer: { kind: 'values', values: ['7/2'] },
  solution: ['Divide: $7 \\div 2 = \\frac{7}{2}$.'],
};

const setup = (problem: Problem) => {
  const onGraded = vi.fn();
  const onNext = vi.fn();
  render(
    <ProblemView
      problem={problem}
      desmosKey={null}
      bookmarked={false}
      onToggleBookmark={() => {}}
      onGraded={onGraded}
      onNext={onNext}
    />,
  );
  return { onGraded, onNext, user: userEvent.setup() };
};

describe('ProblemView multiple choice', () => {
  it('disables Check until a choice is picked', () => {
    setup(mcq);
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('grades a correct answer and offers the next problem', async () => {
    const { onGraded, onNext, user } = setup(mcq);
    await user.click(screen.getByRole('radio', { name: /B/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status')).toHaveTextContent('Correct!');
    expect(onGraded).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, response: 'B' }),
    );
    await user.click(screen.getByRole('button', { name: 'Next problem' }));
    expect(onNext).toHaveBeenCalled();
  });

  it('explains a wrong answer and locks the choices', async () => {
    const { onGraded, user } = setup(mcq);
    await user.click(screen.getByRole('radio', { name: /C/ }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
    expect(screen.getByText('Added one too many.')).toBeInTheDocument();
    expect(screen.getByText(/correct answer/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /A/ })).toBeDisabled();
    expect(onGraded).toHaveBeenCalledWith(
      expect.objectContaining({ correct: false, response: 'C' }),
    );
  });
});

describe('ProblemView typed answer', () => {
  it('accepts an equivalent decimal', async () => {
    const { onGraded, user } = setup(spr);
    await user.type(screen.getByLabelText('Your answer'), '3.5');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status')).toHaveTextContent('Correct!');
    expect(onGraded).toHaveBeenCalledWith(
      expect.objectContaining({ correct: true, response: '3.5' }),
    );
  });

  it('shows a hint instead of grading a badly formed answer', async () => {
    const { onGraded, user } = setup(spr);
    await user.type(screen.getByLabelText('Your answer'), '3/');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status')).toHaveTextContent('Enter numbers only');
    expect(onGraded).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Your answer')).toBeEnabled();
  });

  it('strips characters the answer box does not allow', async () => {
    const { user } = setup(spr);
    await user.type(screen.getByLabelText('Your answer'), '$1,2x');
    expect(screen.getByLabelText('Your answer')).toHaveValue('12');
  });

  it('checks on Enter', async () => {
    const { onGraded, user } = setup(spr);
    await user.type(screen.getByLabelText('Your answer'), '7/2{Enter}');
    expect(onGraded).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
});

describe('ProblemView tools', () => {
  it('opens the formula sheet and the Desmos fallback', async () => {
    const { user } = setup(mcq);
    await user.click(screen.getByRole('button', { name: 'Formula sheet' }));
    expect(screen.getByText('Pythagorean theorem')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Calculator' }));
    expect(screen.getByRole('link', { name: 'Open Desmos' })).toHaveAttribute(
      'href',
      'https://www.desmos.com/calculator',
    );
  });
});
