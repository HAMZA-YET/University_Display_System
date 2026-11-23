import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import NoticeToaster from '../components/lostFound/NoticeToaster';
import ItemForm from '../components/lostFound/ItemForm';
import AdminLfItems from '../pages/adminLostFound/AdminLfItems';
import AdminLfClaims from '../pages/adminLostFound/AdminLfClaims';
import AdminLfDashboard from '../pages/adminLostFound/AdminLfDashboard';
import api from '../api/client';
import * as lostFound from '../api/lostFound';

const account = vi.hoisted(() => ({ user: null }));
vi.mock('../hooks/useAuth', () => ({ default: () => ({ user: account.user }) }));
vi.mock('../api/client', () => ({ default: { get: vi.fn() } }));
vi.mock('../api/lostFound', () => ({
  takeMyNotices: vi.fn(), adminListItems: vi.fn(), adminClaimsByItem: vi.fn(), adminStats: vi.fn(),
  adminDeleteItem: vi.fn(), getPublicItem: vi.fn(), getMyItem: vi.fn(), submitClaim: vi.fn(),
  publicPhotoUrl: (item, photo) => `/api/public/lost-found/items/${item}/photos/${photo}`,
}));

const item = {
  id: 'a'.repeat(24), title: 'Navy folding umbrella', reference: 'LF-2026-00001',
  type: 'FOUND', status: 'OPEN', category: 'UMBRELLA', location: 'Library',
  postedAt: '2026-11-22T12:00:00Z', daysListed: 1, claimCount: 1, pendingClaimCount: 1,
};
const destination = `/admin/lost-found/items/${item.id}`;

beforeEach(() => {
  vi.resetAllMocks();
  account.user = { id: 'account-a', role: 'ADMIN' };
  lostFound.takeMyNotices.mockResolvedValue([]);
  lostFound.adminListItems.mockResolvedValue({ data: [item], meta: { page: 1, totalPages: 1, total: 1, typeCounts: { ALL: 1, LOST: 0, FOUND: 1 } } });
  lostFound.adminClaimsByItem.mockResolvedValue({ data: [{ item, counts: { total: 1, pending: 1 } }], meta: { tabs: { ALL: 1, PENDING: 1, APPROVED: 0, REJECTED: 0 } } });
  lostFound.adminStats.mockResolvedValue({ actionNeeded: { lostItems: 0, foundItems: 1, claimsWaiting: 1 }, byCategory: [], longestFound: [item], longestLost: [] });
  api.get.mockResolvedValue({ data: { data: { maxPhotoBytes: 4 * 1024 * 1024, maxPhotos: 3, photosAvailable: true } } });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function ItemDestination() {
  const location = useLocation();
  return <><h1>Lost and found item destination</h1><p>{location.pathname + location.hash}</p></>;
}

function renderAdmin(Page, path) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path={path} element={<Page />} />
    <Route path="/admin/lost-found/items/:id" element={<ItemDestination />} />
  </Routes></MemoryRouter>);
}

describe('lost-and-found integration boundaries', () => {
  test('admin item titles and Open actions reach the mounted item route', async () => {
    renderAdmin(AdminLfItems, '/admin/lost-found/items');
    const title = await screen.findByRole('link', { name: item.title });
    expect(title).toHaveAttribute('href', destination);
    const open = screen.getByRole('link', { name: 'Open', exact: true });
    expect(open).toHaveAttribute('href', destination);
    await userEvent.click(open);
    expect(await screen.findByText('Lost and found item destination')).toBeInTheDocument();
  });

  test('claim titles and Review claims actions preserve the claims section on the mounted route', async () => {
    renderAdmin(AdminLfClaims, '/admin/lost-found/claims');
    expect(await screen.findByRole('link', { name: item.title })).toHaveAttribute('href', destination + '#claims');
    const review = screen.getByRole('link', { name: 'Review claims' });
    expect(review).toHaveAttribute('href', destination + '#claims');
    await userEvent.click(review);
    expect(await screen.findByText(destination + '#claims')).toBeInTheDocument();
  });

  test('the dashboard held-item list opens the mounted detail route', async () => {
    renderAdmin(AdminLfDashboard, '/admin/lost-found');
    const title = await screen.findByRole('link', { name: item.title });
    expect(title).toHaveAttribute('href', destination);
    await userEvent.click(title);
    expect(await screen.findByText('Lost and found item destination')).toBeInTheDocument();
  });

  test('a delayed notice from the previous account never appears for the next account', async () => {
    vi.useFakeTimers();
    let finishPrevious;
    lostFound.takeMyNotices.mockImplementationOnce(() => new Promise(resolve => { finishPrevious = resolve; }))
      .mockResolvedValueOnce([{ id: 'notice-b', kind: 'success', text: 'Current account decision' }]);
    const tree = () => <MemoryRouter><NoticeToaster /></MemoryRouter>;
    const view = render(tree());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    account.user = { id: 'account-b', role: 'READER' };
    view.rerender(tree());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Current account decision')).toBeInTheDocument();
    await act(async () => { finishPrevious([{ id: 'notice-a', kind: 'info', text: 'Previous account private decision' }]); });
    expect(screen.queryByText('Previous account private decision')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.queryByText('Current account decision')).not.toBeInTheDocument();
  });

  test('logging out clears displayed notices before another account signs in', async () => {
    vi.useFakeTimers();
    lostFound.takeMyNotices.mockResolvedValueOnce([{ id: 'notice-a', kind: 'info', text: 'Previous account private decision' }]);
    const tree = () => <MemoryRouter><NoticeToaster /></MemoryRouter>;
    const view = render(tree());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('Previous account private decision')).toBeInTheDocument();
    account.user = null;
    view.rerender(tree());
    expect(screen.queryByText('Previous account private decision')).not.toBeInTheDocument();
    account.user = { id: 'account-b', role: 'READER' };
    view.rerender(tree());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByText('Previous account private decision')).not.toBeInTheDocument();
  });

  test('report photos use the server upload limit before accepting a file', async () => {
    render(<ItemForm allowPhotos onSubmit={vi.fn()} />);
    expect(await screen.findByText(/Up to 3 JPG\/PNG photos, 4 MB each/)).toBeInTheDocument();
    const oversized = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('+ Add photo'), { target: { files: [oversized] } });
    expect(screen.getByRole('alert')).toHaveTextContent('The photo is larger than 4 MB.');
    expect(screen.queryByAltText('Selected photo 1')).not.toBeInTheDocument();
  });

  test('unavailable storage disables photo selection while leaving report submission available', async () => {
    api.get.mockResolvedValue({ data: { data: { maxPhotoBytes: 4 * 1024 * 1024, maxPhotos: 3, photosAvailable: false } } });
    const { container } = render(<ItemForm allowPhotos onSubmit={vi.fn()} />);
    expect(await screen.findByText('Photo uploads are unavailable. You can post a report without photos.')).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Post report' })).toBeEnabled();
  });
});
