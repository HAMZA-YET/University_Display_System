import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { vi, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import SearchPage from './SearchPage.jsx';
const get = vi.hoisted(() => vi.fn());
vi.mock('../../api/client.js', () => ({ default: { get } }));
vi.mock('../../hooks/useAuth.js', () => ({ default: () => ({ user: null, loading: false }) }));
vi.mock('../../hooks/useDepartments.js', () => ({ default: () => ({ departments: [{ code: 'CS', name: 'Computing' }], byCode: { CS: 'Computing' } }) }));
beforeAll(() => {
  // JSDOM has no layout; Radix scrolls the focused option in the browser.
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => { delete Element.prototype.scrollIntoView; });
beforeEach(() => get.mockReset());

function HistoryControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output aria-label="Current URL">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}

test('loading, API error, keyboard retry and empty results never substitute samples', async () => {
  const user = userEvent.setup();
  let reject;
  get.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  render(<MemoryRouter><SearchPage /></MemoryRouter>);
  expect(screen.getByText('Searching public information…')).toBeInTheDocument();
  reject(new Error('Local test API unavailable'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Local test API unavailable');
  get.mockResolvedValue({ data: { data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 1 } } });
  screen.getByRole('button', { name: 'Try again' }).focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByText('No matching information')).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});

test('invalid URL parameters are explained without an API request', async () => {
  render(<MemoryRouter initialEntries={['/search?page=0&from=2026-02-30']}><SearchPage /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a valid result page.');
  expect(get).not.toHaveBeenCalled();
});

test('pagination preserves filters and browser Back restores the previous URL', async () => {
  get.mockImplementation((path, config) => Promise.resolve({ data: { data: [], meta: { page: config?.params?.page || 1, limit: 12, total: 13, totalPages: 2 } } }));
  render(<MemoryRouter initialEntries={['/search?q=fictional&category=EXAM&department=CS&sort=newest']}><SearchPage /><HistoryControls /></MemoryRouter>);
  await screen.findByText('No results on this page');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(get.mock.calls.at(-1)[1].params.page).toBe(2));
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('page=2');
  expect(get.mock.calls.at(-1)[1].params).toMatchObject({ q: 'fictional', category: 'EXAM', department: 'CS', sort: 'newest' });
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  await waitFor(() => expect(get.mock.calls.at(-1)[1].params.page).toBe(1));
  expect(screen.getByLabelText('Search text')).toHaveValue('fictional');
  expect(screen.getByLabelText('Current URL')).not.toHaveTextContent('page=2');
});

test('professor source sends directory fields without notice-only filters', async () => {
  get.mockResolvedValue({ data: { data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 1 } } });
  render(<MemoryRouter initialEntries={['/search?source=professor&q=learning&department=CS']}><SearchPage /></MemoryRouter>);
  await screen.findByText('No matching information');
  expect(get.mock.calls[0][0]).toBe('/professors');
  expect(get.mock.calls[0][1].params).toEqual({ page: 1, limit: 12, q: 'learning', department: 'CS' });
  expect(screen.queryByLabelText('Notice category')).not.toBeInTheDocument();
});

test('URL-restored notice controls submit verified filters and clear completely', async () => {
  const user = userEvent.setup();
  get.mockResolvedValue({ data: { data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 1 } } });
  render(<MemoryRouter initialEntries={['/search?category=EXAM&from=2026-11-01&sort=newest']}><SearchPage /></MemoryRouter>);
  const category = screen.getByRole('combobox', { name: 'Notice category' });
  expect(category).toHaveTextContent('Exam');
  expect(screen.getByLabelText('Published from (KST, inclusive)')).toHaveValue('2026-11-01');
  expect(screen.getByRole('combobox', { name: 'Sort notices' })).toHaveTextContent('Newest publication first');
  await screen.findByText('No matching information');
  expect(get.mock.calls[0][1].params.from).toBe('2026-11-01T00:00:00.000+09:00');
  category.focus();
  await user.keyboard('{Enter}');
  const options = within(await screen.findByRole('listbox', { name: 'Notice category' }));
  await user.keyboard('{End}');
  await waitFor(() => expect(options.getByRole('option', { name: 'General' })).toHaveFocus());
  await user.keyboard('{Enter}');
  expect(category).toHaveTextContent('General');
  await waitFor(() => expect(category).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
  await waitFor(() => expect(get.mock.calls.at(-1)[1].params.category).toBe('GENERAL'));
  fireEvent.click(screen.getByRole('link', { name: 'Clear search' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Notice category' })).toHaveTextContent('All categories'));
  expect(screen.getByLabelText('Published from (KST, inclusive)')).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Sort notices' })).toHaveTextContent('University priority order');
});

test('Escape closes a source menu without changing the current filters', async () => {
  const user = userEvent.setup();
  get.mockResolvedValue({ data: { data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 1 } } });
  render(<MemoryRouter><SearchPage /></MemoryRouter>);
  await screen.findByText('No matching information');
  const source = screen.getByRole('combobox', { name: 'Search in' });
  source.focus();
  await user.keyboard('{ArrowDown}');
  const options = within(await screen.findByRole('listbox', { name: 'Search in' }));
  expect(options.getByRole('option', { name: 'Public notices', selected: true })).toBeInTheDocument();
  await user.keyboard('{ArrowDown}{Escape}');
  await waitFor(() => expect(source).toHaveFocus());
  expect(source).toHaveTextContent('Public notices');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(1);
});
