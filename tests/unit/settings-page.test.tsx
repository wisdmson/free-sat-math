import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../../src/components/SettingsPage';

describe('SettingsPage download', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the file link alive until the browser has started the download', () => {
    vi.useFakeTimers();
    // Safari cancels a download whose object URL is revoked in the same task as the click.
    const create = vi.fn(() => 'blob:progress');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Download progress' }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:progress');
  });
});
