import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResetRoutine, { CHECKLIST } from '../../src/components/play/ResetRoutine';

describe('ResetRoutine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('breathes for 20 seconds (in 4, out 6, twice), then shows the unstuck checklist', () => {
    render(<ResetRoutine reduced={false} onClose={() => {}} />);
    expect(screen.getByText('Breathe in')).toBeVisible();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByText('Breathe out')).toBeVisible();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByText('Breathe in')).toBeVisible();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('heading', { name: 'Get unstuck' })).toBeVisible();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([...CHECKLIST]);
  });
  it('uses a text countdown instead of the circle with reduced motion', () => {
    const { container } = render(<ResetRoutine reduced onClose={() => {}} />);
    expect(container.querySelector('.reset-circle')).toBeNull();
    expect(screen.getByText('4')).toBeVisible();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('3')).toBeVisible();
  });
  it('can skip to the checklist, and closes with its button or Escape', () => {
    const onClose = vi.fn();
    render(<ResetRoutine reduced onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to the checklist' }));
    expect(screen.getByRole('heading', { name: 'Get unstuck' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the questions' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
