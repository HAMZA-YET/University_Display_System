import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../context/AuthContext';
import SampleContentPanel from '../components/admin/SampleContentPanel';
import { installSampleContent, sampleContentStatus } from '../api/sampleContent';

vi.mock('../api/sampleContent', () => ({ installSampleContent: vi.fn(), sampleContentStatus: vi.fn() }));
const empty = { installed: false, complete: false, counts: { departments: 0, professors: 0, notices: 0, events: 0 } };
const complete = { installed: true, complete: true, counts: { departments: 6, professors: 6, notices: 12, events: 6 } };
const administrator = { id: 'administrator', name: 'Portal Owner', role: 'ADMIN' };

function renderPanel(user = administrator, onInstalled = vi.fn()) {
  render(<AuthProvider initialUser={user}><SampleContentPanel onInstalled={onInstalled} /></AuthProvider>);
  return onInstalled;
}

describe('sample content installation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sampleContentStatus.mockResolvedValue(empty);
    installSampleContent.mockResolvedValue(complete);
  });

  test('keeps sample management hidden from readers', () => {
    renderPanel({ ...administrator, role: 'READER' });
    expect(screen.queryByText('Sample content')).not.toBeInTheDocument();
    expect(sampleContentStatus).not.toHaveBeenCalled();
    expect(installSampleContent).not.toHaveBeenCalled();
  });

  test('requires explicit confirmation before installation and refreshes only after success', async () => {
    const onInstalled = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Install sample content' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Install sample content' }));
    expect(dialog.getByText(/Existing records will be preserved/)).toBeInTheDocument();
    expect(installSampleContent).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole('button', { name: 'Install sample content' }));
    expect(await screen.findByText('Sample content is installed')).toBeInTheDocument();
    expect(onInstalled).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sample content installed' })).toBeDisabled();
  });

  test('retains a failed confirmation for retry and does not claim success', async () => {
    installSampleContent.mockRejectedValue(new Error('Sample content could not be installed.'));
    const onInstalled = renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Install sample content' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Install sample content' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Install sample content' }));
    expect(await dialog.findByText('Sample content could not be installed.')).toBeInTheDocument();
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Install sample content' })).not.toBeDisabled());
    expect(onInstalled).not.toHaveBeenCalled();
    expect(screen.queryByText('Sample content is installed')).not.toBeInTheDocument();
  });
});
