import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, beforeEach, expect } from 'vitest';
import BookmarkControl from './items/BookmarkControl.jsx';
import InboxApp from './notifications/InboxApp.jsx';
import SavedInterests from './items/SavedInterests.jsx';
const state = vi.hoisted(() => ({ auth: { user: null, loading: false }, get: vi.fn(), put: vi.fn(), delete: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../hooks/useAuth.js', () => ({ default: () => state.auth }));
vi.mock('../api/client.js', () => ({ default: { get: state.get, put: state.put, delete: state.delete, post: state.post, patch: state.patch } }));
const wrap = (element) => <MemoryRouter>{element}</MemoryRouter>;
beforeEach(() => {
  state.auth = { user: null, loading: false };
  for (const method of ['get', 'put', 'delete', 'post', 'patch']) state[method].mockReset();
});
describe('Real member tools UI', () => {
  test('guests see login and never fetch personal records', () => {
    render(wrap(<InboxApp />));
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(state.get).not.toHaveBeenCalled();
    expect(screen.queryByText(/synthetic account/i)).not.toBeInTheDocument();
  });
  test('saving sends no client identity and resets status when the account changes', async () => {
    state.auth = { user: { id: 'account-a' }, loading: false };
    state.get.mockResolvedValue({ data: { data: { saved: false } } });
    state.put.mockResolvedValue({ data: { data: { saved: true } } });
    const view = render(wrap(<BookmarkControl noticeId="012345678901234567890123" />));
    const save = await screen.findByRole('button', { name: 'Save notice' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await screen.findByText('Notice saved to your account.');
    expect(state.put).toHaveBeenCalledWith('/member-tools/bookmarks/012345678901234567890123', {});
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toHaveAttribute('aria-pressed', 'true');
    state.auth = { user: { id: 'account-b' }, loading: false };
    view.rerender(wrap(<BookmarkControl noticeId="012345678901234567890123" />));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save notice' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Remove bookmark' })).not.toBeInTheDocument();
  });
  test('database failure appears without sample inbox records', async () => {
    state.auth = { user: { id: 'account-a' }, loading: false };
    state.get.mockRejectedValue(new Error('Database unavailable'));
    render(wrap(<InboxApp />));
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Blue notebook|Extended library|Synthetic/i)).not.toBeInTheDocument();
  });
  test('withdrawn bookmarks show generic state while removal still works', async () => {
    state.auth = { user: { id: 'account-a' }, loading: false };
    state.get.mockImplementation((path) => {
      if (path.startsWith('/member-tools/bookmarks')) return Promise.resolve({ data: { data: [{ id: 'bookmark', noticeId: '012345678901234567890123', available: false, notice: null }], meta: { page: 1, total: 1, totalPages: 1 } } });
      if (path === '/member-tools/preferences') return Promise.resolve({ data: { data: { inApp: true, notices: true } } });
      return Promise.resolve({ data: { data: [] } });
    });
    state.delete.mockResolvedValue({ data: { data: { saved: false } } });
    render(wrap(<SavedInterests />));
    expect(await screen.findByText('Notice no longer available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));
    await waitFor(() => expect(state.delete).toHaveBeenCalledWith('/member-tools/bookmarks/012345678901234567890123'));
  });
});
