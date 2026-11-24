import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import PrivateEvidence from '../components/lostFound/PrivateEvidence';
import * as security from '../api/security';
import useAuth from '../hooks/useAuth';

vi.mock('../api/security', () => ({ evidenceCapabilities: vi.fn(), listEvidence: vi.fn(), uploadEvidence: vi.fn(), deleteEvidence: vi.fn(), downloadEvidence: vi.fn() }));
vi.mock('../hooks/useAuth', () => ({ default: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  useAuth.mockReturnValue({ user: { id: 'claimant-a' } });
  security.evidenceCapabilities.mockResolvedValue({ available: true, maxBytes: 4 * 1024 * 1024 });
  security.listEvidence.mockResolvedValue([]);
});
test('claim proof uploads one image through the authenticated client and refreshes metadata', async () => {
  const file = new File(['synthetic-image'], 'proof.png', { type: 'image/png' });
  security.uploadEvidence.mockResolvedValue({ fileId: 'proof-a' });
  security.listEvidence.mockResolvedValueOnce([]).mockResolvedValueOnce([{ fileId: 'proof-a', name: 'proof.png' }]);
  render(<PrivateEvidence claimId="claim-a" canUpload canDelete />);
  const input = await screen.findByLabelText(/Attach a JPEG or PNG image/);
  const events = userEvent.setup();
  await events.upload(input, file);
  expect(input.files[0]).toBe(file);
  fireEvent.submit(input.closest('form'));
  expect(await screen.findByText('Private proof attached.')).toBeInTheDocument();
  expect(security.uploadEvidence).toHaveBeenCalledWith('claim-a', file);
  expect(screen.getByText('proof.png')).toBeInTheDocument();
  expect(document.querySelector('a[href^="https:"]')).toBeNull();
});
test('unavailable storage leaves written-proof guidance and hides upload', async () => {
  security.evidenceCapabilities.mockResolvedValue({ available: false, maxBytes: 4 * 1024 * 1024 });
  render(<PrivateEvidence claimId="claim-a" canUpload />);
  expect(await screen.findByText(/Proof-file uploads are unavailable/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Attach private proof' })).not.toBeInTheDocument();
});
test('account switch discards stale file lists and late downloads', async () => {
  security.listEvidence.mockResolvedValue([{ fileId: 'proof-a', name: 'private-a.png' }]);
  let finishDownload;
  security.downloadEvidence.mockImplementation(() => new Promise(resolve => { finishDownload = resolve; }));
  const create = vi.fn();
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; });
  const view = render(<PrivateEvidence claimId="claim-a" />);
  await screen.findByText('private-a.png');
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  useAuth.mockReturnValue({ user: null });
  view.rerender(<PrivateEvidence claimId="claim-a" />);
  await act(async () => { finishDownload(new Blob(['private'])); });
  expect(create).not.toHaveBeenCalled();
  expect(screen.queryByText('private-a.png')).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});
test('late initial metadata cannot cross an account switch', async () => {
  let finishList;
  security.listEvidence.mockImplementationOnce(() => new Promise(resolve => { finishList = resolve; })).mockResolvedValueOnce([]);
  const view = render(<PrivateEvidence claimId="claim-a" />);
  useAuth.mockReturnValue({ user: { id: 'claimant-b' } });
  view.rerender(<PrivateEvidence claimId="claim-a" />);
  await act(async () => { finishList([{ fileId: 'proof-a', name: 'private-a.png' }]); });
  expect(screen.queryByText('private-a.png')).not.toBeInTheDocument();
});
