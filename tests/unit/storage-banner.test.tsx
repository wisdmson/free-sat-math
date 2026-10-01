import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const restore = vi.fn(() => ({ saved: false, refused: true as const }));
vi.mock('../../src/store/progress-store', () => ({ getProgressStore: () => ({ restore }) }));

const { default: StorageBanner } = await import('../../src/components/StorageBanner');
const { emptyProgress } = await import('../../src/store/progress');

describe('StorageBanner', () => {
  it('tells the student when a restore could not be done', async () => {
    render(
      <StorageBanner
        snapshot={{ progress: emptyProgress(), status: 'ok', saveFailed: false, restorable: 'k' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Restore your progress' }));
    expect(restore).toHaveBeenCalledWith('k');
    expect(screen.getByRole('status')).toHaveTextContent("couldn't restore");
  });
  it('explains that an older copy of the site is open in another tab', () => {
    render(
      <StorageBanner
        snapshot={{ progress: emptyProgress(), status: 'older', saveFailed: false }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('older version of this site is open');
  });
});
