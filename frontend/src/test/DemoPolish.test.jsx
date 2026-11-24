import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LostFoundBrowse from '../pages/lostFound/LostFoundBrowse';
import MyClaim from '../pages/lostFound/MyClaim';
import MyReport from '../pages/lostFound/MyReport';
import SearchPage from '../member4/search/SearchPage';
import * as lostFound from '../api/lostFound';
import api from '../api/client';

vi.mock('../hooks/useAuth', () => ({ default: () => ({ user: { id: 'demo-member', role: 'READER' }, hasRole: () => false }) }));
vi.mock('../hooks/useDepartments', () => ({ default: () => ({ departments: [], byCode: {} }) }));
vi.mock('../api/client', () => ({ default: { get: vi.fn() } }));
vi.mock('../api/lostFound', () => ({
  listPublicItems: vi.fn(), getMyItem: vi.fn(), getMyClaim: vi.fn(), getPublicItem: vi.fn(),
  deleteMyItem: vi.fn(), deleteMyClaim: vi.fn(), resolveMyItem: vi.fn(), submitClaim: vi.fn(),
  publicPhotoUrl: (item, photo) => `/api/public/lost-found/items/${item}/photos/${photo}`,
}));
vi.mock('../components/lostFound/PhotoManager', () => ({ default: () => null }));
vi.mock('../components/lostFound/PrivateEvidence', () => ({ default: () => null }));
vi.mock('../member4/items/BookmarkControl', () => ({ default: () => null }));

const id = '012345678901234567890123';
const item = { id, title: 'Navy umbrella', type: 'FOUND', category: 'UMBRELLA', status: 'OPEN',
  location: 'Library', reference: 'LF-2026-00001', postedAt: '2026-11-25T00:00:00Z', photoIds: [] };

beforeEach(() => {
  vi.resetAllMocks();
  lostFound.getMyItem.mockResolvedValue(item);
  lostFound.getMyClaim.mockResolvedValue({ id, item, status: 'PENDING', evidenceRedacted: true, createdAt: '2026-11-25T00:00:00Z' });
});

test('an out-of-range item page recovers to page one without losing filters', async () => {
  lostFound.listPublicItems.mockImplementation((params) => Promise.resolve({
    data: Number(params.page) === 1 ? [item] : [],
    meta: { page: Number(params.page), limit: 12, total: 1, totalPages: 1 },
  }));
  render(<MemoryRouter initialEntries={['/items?type=FOUND&category=UMBRELLA&q=navy&page=3']}><LostFoundBrowse /></MemoryRouter>);
  expect(await screen.findByText('No items on this page')).toBeInTheDocument();
  expect(screen.getByLabelText('Search lost and found')).toHaveAttribute('maxlength', '100');
  fireEvent.click(screen.getByRole('button', { name: 'Return to first page' }));
  expect(await screen.findByRole('link', { name: 'Navy umbrella' })).toBeInTheDocument();
  await waitFor(() => expect(Number(lostFound.listPublicItems.mock.calls.at(-1)[0].page)).toBe(1));
  expect(lostFound.listPublicItems.mock.calls.at(-1)[0]).toMatchObject({ type: 'FOUND', category: 'UMBRELLA', q: 'navy' });
});

function DirectoryDestination() {
  const location = useLocation();
  return <h1>{new URLSearchParams(location.search).get('q')}</h1>;
}

test('an all-source professor result opens the directory with the selected name', async () => {
  api.get.mockResolvedValue({ data: { data: [{ id, source: 'professor', title: 'Learning & Systems Professor', summary: 'Computer science', href: '/professors' }], meta: { page: 1, total: 1, totalPages: 1 } } });
  render(<MemoryRouter initialEntries={['/search?source=all&q=learning']}><Routes>
    <Route path="/search" element={<SearchPage />} />
    <Route path="/professors" element={<DirectoryDestination />} />
  </Routes></MemoryRouter>);
  const link = await screen.findByRole('link', { name: 'Learning & Systems Professor' });
  expect(new URL(link.href).searchParams.get('q')).toBe('Learning & Systems Professor');
  fireEvent.click(link);
  expect(await screen.findByRole('heading', { name: 'Learning & Systems Professor' })).toBeInTheDocument();
});

function InboxDestination() {
  const location = useLocation();
  return <h1>{location.state?.focusReturn ? 'Inbox with focus return' : 'Inbox'}</h1>;
}

test.each([
  ['claim', MyClaim, '/items/my-claims/'],
  ['report', MyReport, '/items/my-reports/'],
])('own %s opened from notifications has a focused return link', async (_kind, Page, prefix) => {
  render(<MemoryRouter initialEntries={[{ pathname: prefix + id, state: { returnTo: '/notifications' } }]}><Routes>
    <Route path={prefix + ':id'} element={<Page />} />
    <Route path="/notifications" element={<InboxDestination />} />
  </Routes></MemoryRouter>);
  const back = await screen.findByRole('link', { name: 'Back to notifications' });
  expect(back).toHaveAttribute('href', '/notifications');
  fireEvent.click(back);
  expect(await screen.findByText('Inbox with focus return')).toBeInTheDocument();
});

test.each([
  ['claim', MyClaim, '/items/my-claims/'],
  ['report', MyReport, '/items/my-reports/'],
])('own %s ignores an unrecognized notification return destination', async (_kind, Page, prefix) => {
  render(<MemoryRouter initialEntries={[{ pathname: prefix + id, state: { returnTo: '/notifications?redirect=external' } }]}><Routes>
    <Route path={prefix + ':id'} element={<Page />} />
  </Routes></MemoryRouter>);
  await screen.findByRole('heading', { level: 1 });
  expect(screen.queryByRole('link', { name: 'Back to notifications' })).not.toBeInTheDocument();
});
