import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import NumPad, { padInput } from '../../src/components/NumPad';

describe('padInput', () => {
  it('builds numbers, fractions and negatives one key at a time', () => {
    const type = (keys: string[], max = 8) => keys.reduce((v, k) => padInput(v, k, max), '');
    expect(type(['7', '/', '2'])).toBe('7/2');
    expect(type(['3', '.', '5', '.'])).toBe('3.5');
    expect(type(['/'])).toBe('');
    expect(type(['4', '.', '/'])).toBe('4.');
    expect(type(['5', '−'])).toBe('-5');
    expect(type(['5', '−', '−'])).toBe('5');
    expect(type(['1', '2', '⌫'])).toBe('1');
    expect(type(['1', '2', '3', '4'], 3)).toBe('123');
  });
});

function Harness({
  onSubmit = () => {},
  active = true,
}: {
  onSubmit?: () => void;
  active?: boolean;
}) {
  const [v, setV] = useState('');
  return (
    <NumPad
      id="pad"
      label="Your answer"
      value={v}
      onChange={setV}
      onSubmit={onSubmit}
      active={active}
    />
  );
}

describe('NumPad', () => {
  it('types with taps and submits with ✓', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    for (const k of ['1', '2', '/', '5'])
      await userEvent.click(screen.getByRole('button', { name: k }));
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('12/5');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it('accepts the physical keyboard while active', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    for (const key of ['-', '4', '.', '5', 'Backspace', '2']) fireEvent.keyDown(window, { key });
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('−4.2');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it('an inactive pad ignores the keyboard', () => {
    render(<Harness active={false} />);
    fireEvent.keyDown(window, { key: '7' });
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('');
  });
});
