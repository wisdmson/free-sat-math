import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DesmosPanel, { loadDesmos, type DesmosApi } from '../../src/components/DesmosPanel';

describe('DesmosPanel', () => {
  it('shows the fallback link when there is no key', () => {
    render(<DesmosPanel apiKey={null} expressions={['y = 2x']} />);
    expect(screen.getByRole('link', { name: 'Open Desmos' })).toHaveAttribute('target', '_blank');
    expect(screen.getByText('y = 2x')).toBeInTheDocument();
  });

  it('falls back when the script fails to load', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('blocked')));
    render(<DesmosPanel apiKey="key" loader={loader} />);
    expect(screen.getByText('Loading calculator…')).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Open Desmos' });
  });

  it('embeds the calculator and preloads expressions when the script loads', async () => {
    const setExpression = vi.fn();
    const destroy = vi.fn();
    const api: DesmosApi = { GraphingCalculator: vi.fn(() => ({ setExpression, destroy })) };
    const { unmount } = render(
      <DesmosPanel
        apiKey="key"
        expressions={['y = 2x', 'x + y = 3']}
        loader={() => Promise.resolve(api)}
      />,
    );
    await waitFor(() => expect(screen.queryByText('Loading calculator…')).not.toBeInTheDocument());
    expect(setExpression).toHaveBeenCalledWith({ id: 'e0', latex: 'y = 2x' });
    expect(setExpression).toHaveBeenCalledWith({ id: 'e1', latex: 'x + y = 3' });
    unmount();
    expect(destroy).toHaveBeenCalled();
  });

  it('loadDesmos gives up after the timeout and can be retried', async () => {
    const first = loadDesmos('key', 20);
    await expect(first).rejects.toThrow('timed out');
    const scripts = () => document.head.querySelectorAll('script[src*="desmos.com/api"]').length;
    const before = scripts();
    await expect(loadDesmos('key', 20)).rejects.toThrow('timed out');
    expect(scripts()).toBe(before + 1);
  });
});
