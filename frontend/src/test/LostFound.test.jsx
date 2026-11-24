import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import ItemForm from '../components/lostFound/ItemForm';
import LostFoundItem from '../pages/lostFound/LostFoundItem';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import * as lfApi from '../api/lostFound';

// Bookmark behavior has its own authenticated API/owner-isolation regressions.
vi.mock('../member4/items/BookmarkControl', () => ({ default: () => null }));

vi.mock('../api/lostFound', () => ({
  getPublicItem: vi.fn(),
  getMyItem: vi.fn(),
  submitClaim: vi.fn(),
  publicPhotoUrl: (i, p) => `/x/${i}/${p}`,
}));

const foundItem = {
  id: 'a'.repeat(24),
  reference: 'LF-2026-00001',
  type: 'FOUND',
  title: 'Navy folding umbrella',
  description: 'Navy blue folding umbrella with a wooden handle.',
  category: 'UMBRELLA',
  location: 'Library',
  postedAt: '2026-11-18T12:07:00Z',
  custodyNote: 'Student Services, Room 105',
  contactDetails: null,
  status: 'OPEN',
  photoIds: [],
};

function renderItem(user, item = foundItem, { mine = false } = {}) {
  lfApi.getPublicItem.mockResolvedValue(item);
  if (mine) lfApi.getMyItem.mockResolvedValue(item);
  else lfApi.getMyItem.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
  return render(
    <AuthProvider initialUser={user}>
      <MemoryRouter initialEntries={[`/items/${item.id}`]}>
        <Routes>
          <Route path="/items/:id" element={<LostFoundItem />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

const student = { id: 'u1', name: 'Student', role: 'READER' };
const admin = { id: 'u2', name: 'Admin', role: 'ADMIN' };

describe('FE-LF Lost and found', () => {
  beforeEach(() => vi.clearAllMocks());

  test('FE-LF-1 report form has no date field and validates before calling the API', async () => {
    const onSubmit = vi.fn();
    render(<ItemForm onSubmit={onSubmit} />);
    expect(screen.queryByLabelText(/when was it/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /post report/i }));
    expect(await screen.findByText('Choose Lost or Found')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('FE-LF-2 private details only for lost items; warning when contact is public', async () => {
    render(<ItemForm onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByLabelText(/i found something/i));
    expect(screen.queryByLabelText(/identifying details/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/i lost something/i));
    expect(screen.getByLabelText(/identifying details/i)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Everyone'));
    expect(screen.getByText(/share personal details/i)).toBeInTheDocument();
  });

  test('FE-LF-3 visitors who are not logged in are sent to the login page', () => {
    render(
      <AuthProvider initialUser={null}>
        <MemoryRouter initialEntries={['/items']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/items" element={<h1>Lost and found list</h1>} />
            </Route>
            <Route path="/login" element={<h1>Login page</h1>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Lost and found list')).not.toBeInTheDocument();
  });

  test('FE-LF-4 students can claim an open found item', async () => {
    renderItem(student);
    expect(await screen.findByRole('button', { name: 'Claim' })).toBeInTheDocument();
  });

  test('FE-LF-5 lost items have no claim button; admins never see the claim form', async () => {
    renderItem(student, { ...foundItem, type: 'LOST', custodyNote: null });
    expect(await screen.findByText('Did you find this?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument();
  });

  test('FE-LF-6 admins see the normal item view without a claim form', async () => {
    renderItem(admin);
    expect(await screen.findByText('Navy folding umbrella')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument();
  });

  test('FE-LF-8 the finder sees "This is your report" instead of the Claim form', async () => {
    renderItem(student, foundItem, { mine: true });
    expect(await screen.findByText('This is your report')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument();
  });

  test('FE-LF-7 admin pages redirect students', () => {
    render(
      <AuthProvider initialUser={student}>
        <MemoryRouter initialEntries={['/admin/lost-found']}>
          <Routes>
            <Route element={<ProtectedRoute roles={['ADMIN']} />}>
              <Route path="/admin/lost-found" element={<h1>Admin Dashboard</h1>} />
            </Route>
            <Route path="/forbidden" element={<h1>Access denied page</h1>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    expect(screen.getByText('Access denied page')).toBeInTheDocument();
  });
});
