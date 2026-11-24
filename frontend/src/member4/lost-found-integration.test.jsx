import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SearchPage from './search/SearchPage';
import BookmarkControl from './items/BookmarkControl';
import SavedInterests from './items/SavedInterests';
import InboxApp from './notifications/InboxApp';

const state = vi.hoisted(() => ({ auth: { user: null, loading: false }, get: vi.fn(), put: vi.fn(), delete: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../hooks/useAuth.js', () => ({ default: () => state.auth }));
vi.mock('../hooks/useDepartments.js', () => ({ default: () => ({ departments: [], byCode: {} }) }));
vi.mock('../api/client.js', () => ({ default: { get: state.get, put: state.put, delete: state.delete, post: state.post, patch: state.patch } }));
const id = '012345678901234567890123';
const list = (data, total = data.length) => ({ data: { data, meta: { page: 1, limit: 12, total, totalPages: 1 } } });
const searchTree = () => <MemoryRouter initialEntries={['/search?source=item&q=umbrella']}><SearchPage /></MemoryRouter>;

beforeEach(() => {
  state.auth = { user: null, loading: false };
  for (const method of ['get', 'put', 'delete', 'post', 'patch']) state[method].mockReset();
});

test('visitors never request item search or see previous authenticated results', async () => {
  const view = render(searchTree());
  expect(await screen.findByText('Sign in to search lost and found')).toBeInTheDocument();
  expect(state.get).not.toHaveBeenCalled();
  state.auth = { user: { id: 'account-a' }, loading: false };
  state.get.mockResolvedValue(list([{ id, title: 'Account-only umbrella', description: 'A listed item.' }]));
  view.rerender(searchTree());
  expect(await screen.findByText('Account-only umbrella')).toBeInTheDocument();
  expect(state.get.mock.calls[0][0]).toBe('/public/lost-found/items');
  state.auth = { user: null, loading: false };
  view.rerender(searchTree());
  expect(screen.queryByText('Account-only umbrella')).not.toBeInTheDocument();
  expect(await screen.findByText('Sign in to search lost and found')).toBeInTheDocument();
  expect(state.get).toHaveBeenCalledTimes(1);
});

test('a pending item-search response is discarded after logout', async () => {
  state.auth = { user: { id: 'account-a' }, loading: false };
  let complete;
  state.get.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const view = render(searchTree());
  await waitFor(() => expect(state.get).toHaveBeenCalledTimes(1));
  state.auth = { user: null, loading: false };
  view.rerender(searchTree());
  await act(async () => { complete(list([{ id, title: 'Private pending title' }])); });
  expect(screen.queryByText('Private pending title')).not.toBeInTheDocument();
  expect(await screen.findByText('Sign in to search lost and found')).toBeInTheDocument();
});

test('all-source search uses authoritative server pagination and preserves its source destination', async () => {
  state.auth = { user: { id: 'account-a' }, loading: false };
  state.get.mockResolvedValue(list([{ id, source: 'item', title: 'Combined umbrella', summary: 'Listed report.', href: `/items/${id}` }]));
  render(<MemoryRouter initialEntries={['/search?source=all&q=umbrella&page=2']}><SearchPage /></MemoryRouter>);
  const link = await screen.findByRole('link', { name: 'Combined umbrella' });
  expect(link).toHaveAttribute('href', `/items/${id}`);
  expect(state.get.mock.calls[0][0]).toBe('/member-tools/search');
  expect(state.get.mock.calls[0][1].params).toEqual({ page: 2, limit: 12, q: 'umbrella' });
  expect(screen.queryByLabelText('Department')).not.toBeInTheDocument();
});

test('item saving sends no identity and resets saved state when the account changes', async () => {
  state.auth = { user: { id: 'account-a' }, loading: false };
  state.get.mockResolvedValue({ data: { data: { saved: false } } });
  state.put.mockResolvedValue({ data: { data: { saved: true } } });
  const tree = () => <MemoryRouter><BookmarkControl itemId={id} /></MemoryRouter>;
  const view = render(tree());
  const save = await screen.findByRole('button', { name: 'Save item' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  expect(await screen.findByText('Item saved to your account.')).toBeInTheDocument();
  expect(state.put).toHaveBeenCalledWith(`/member-tools/item-bookmarks/${id}`, {});
  state.auth = { user: { id: 'account-b' }, loading: false };
  view.rerender(tree());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save item' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Remove bookmark' })).not.toBeInTheDocument();
});

test('saved closed items stay generic and remain removable', async () => {
  state.auth = { user: { id: 'account-a' }, loading: false };
  state.get.mockImplementation((path) => {
    if (path.startsWith('/member-tools/item-bookmarks')) return Promise.resolve(list([{ id: 'bookmark', itemId: id, available: false, item: null }]));
    if (path.startsWith('/member-tools/bookmarks')) return Promise.resolve(list([]));
    if (path === '/member-tools/preferences') return Promise.resolve({ data: { data: { inApp: true, notices: true } } });
    return Promise.resolve({ data: { data: [] } });
  });
  state.delete.mockResolvedValue({ data: { data: { saved: false } } });
  render(<MemoryRouter><SavedInterests /></MemoryRouter>);
  expect(await screen.findByText('Item no longer available')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove saved item' }));
  await waitFor(() => expect(state.delete).toHaveBeenCalledWith(`/member-tools/item-bookmarks/${id}`));
});

function CaseDestination() {
  const location = useLocation();
  return <><h1>Own case destination</h1><p>{location.state?.returnTo}</p></>;
}

test('shared inbox opens an allowlisted own-case destination with return context', async () => {
  state.auth = { user: { id: 'account-a' }, loading: false };
  state.get.mockImplementation((path) => path.endsWith('/open')
    ? Promise.resolve({ data: { data: { href: `/items/my-claims/${id}` } } })
    : Promise.resolve({ data: { data: [{ id: 'delivery', source: 'LOST_FOUND', type: 'LF_CLAIM_APPROVED', available: true, read: false, occurredAt: '2026-11-25T00:00:00Z', item: { title: 'Own umbrella case', summary: 'Claim approved.' }, notice: null }], meta: { unread: 1, page: 1, totalPages: 1, total: 1 } } }));
  render(<MemoryRouter initialEntries={['/notifications']}><Routes><Route path="/notifications" element={<InboxApp />} /><Route path="/items/my-claims/:id" element={<CaseDestination />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Open case' }));
  expect(await screen.findByText('Own case destination')).toBeInTheDocument();
  expect(screen.getByText('/notifications')).toBeInTheDocument();
});

test('a delayed previous-account inbox open cannot navigate the next account', async () => {
  state.auth = { user: { id: 'account-a' }, loading: false };
  let completeOpen;
  state.get.mockImplementation((path) => {
    if (path.endsWith('/open')) return new Promise(resolve => { completeOpen = resolve; });
    return Promise.resolve({ data: { data: state.auth.user.id === 'account-a' ? [{ id: 'delivery-a', source: 'LOST_FOUND', type: 'LF_CLAIM_APPROVED', available: true, read: false, occurredAt: '2026-11-25T00:00:00Z', item: { title: 'Previous account case', summary: 'Claim approved.' }, notice: null }] : [], meta: { unread: 1, page: 1, totalPages: 1, total: 1 } } });
  });
  const tree = () => <MemoryRouter initialEntries={['/notifications']}><Routes><Route path="/notifications" element={<InboxApp />} /><Route path="/items/my-claims/:id" element={<CaseDestination />} /></Routes></MemoryRouter>;
  const view = render(tree());
  fireEvent.click(await screen.findByRole('button', { name: 'Open case' }));
  await waitFor(() => expect(completeOpen).toBeTypeOf('function'));
  state.auth = { user: { id: 'account-b' }, loading: false };
  view.rerender(tree());
  expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  await act(async () => { completeOpen({ data: { data: { href: `/items/my-claims/${id}` } } }); });
  expect(screen.queryByText('Own case destination')).not.toBeInTheDocument();
  expect(screen.queryByText('Previous account case')).not.toBeInTheDocument();
  expect(screen.getByText('No notifications yet')).toBeInTheDocument();
});
