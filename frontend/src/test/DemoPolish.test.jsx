import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SearchPage from '../member4/search/SearchPage';
import api from '../api/client';

vi.mock('../hooks/useAuth', () => ({ default: () => ({ user: { id: 'demo-member', role: 'READER' }, hasRole: () => false }) }));
vi.mock('../hooks/useDepartments', () => ({ default: () => ({ departments: [], byCode: {} }) }));
vi.mock('../api/client', () => ({ default: { get: vi.fn() } }));

const id = '012345678901234567890123';

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
