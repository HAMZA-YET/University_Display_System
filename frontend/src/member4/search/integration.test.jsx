import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import SearchPage from './SearchPage.jsx';
const get = vi.hoisted(() => vi.fn());
vi.mock('../../api/client.js', () => ({ default: { get } }));
vi.mock('../../hooks/useDepartments.js', () => ({ default: () => ({ departments: [{ code: 'CS', name: 'Computing' }], byCode: { CS: 'Computing' } }) }));

test('URL-restored notice controls submit verified filters and clear completely', async () => {
  get.mockResolvedValue({ data: { data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 1 } } });
  render(<MemoryRouter initialEntries={['/search?category=EXAM&from=2026-11-01&sort=newest']}><SearchPage /></MemoryRouter>);
  expect(screen.getByLabelText('Notice category')).toHaveValue('EXAM');
  expect(screen.getByLabelText('Published from (KST, inclusive)')).toHaveValue('2026-11-01');
  expect(screen.getByLabelText('Sort notices')).toHaveValue('newest');
  await screen.findByText('No matching information');
  expect(get.mock.calls[0][1].params.from).toBe('2026-11-01T00:00:00.000+09:00');
  fireEvent.change(screen.getByLabelText('Notice category'), { target: { value: 'GENERAL' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
  await waitFor(() => expect(get.mock.calls.at(-1)[1].params.category).toBe('GENERAL'));
  fireEvent.click(screen.getByRole('link', { name: 'Clear search' }));
  await waitFor(() => expect(screen.getByLabelText('Notice category')).toHaveValue(''));
  expect(screen.getByLabelText('Published from (KST, inclusive)')).toHaveValue('');
  expect(screen.getByLabelText('Sort notices')).toHaveValue('default');
});
