import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Events from '../pages/Events';
import Professors from '../pages/Professors';
import { listPublicEvents } from '../api/events';
import { listProfessors, professorDepartments } from '../api/professors';
import { monthStartIso, zonedParts } from '../lib/time';

vi.mock('../api/events', () => ({ listPublicEvents: vi.fn() }));
vi.mock('../api/professors', () => ({ listProfessors: vi.fn(), professorDepartments: vi.fn() }));
vi.mock('../hooks/useDepartments', () => ({ default: () => ({ departments: [{ code: 'AI', name: 'Artificial Intelligence' }], byCode: { AI: 'Artificial Intelligence' } }) }));

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
function show(element, path) {
  return render(<MemoryRouter initialEntries={[path]}>{element}<Location /></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  listPublicEvents.mockResolvedValue({ data: [], meta: { total: 0, page: 1, totalPages: 1 } });
  listProfessors.mockResolvedValue({ data: [], meta: { total: 0, page: 1, totalPages: 1, departmentCounts: {} } });
  professorDepartments.mockResolvedValue([{ code: 'AI', name: 'Artificial Intelligence', count: 1 }]);
});

test('events still default to upcoming and All events omits the backend state filter', async () => {
  show(<Events />, '/events?department=AI');
  await waitFor(() => expect(listPublicEvents).toHaveBeenCalledWith(expect.objectContaining({ state: 'UPCOMING', department: 'AI' })));
  expect(screen.getByRole('button', { name: 'Upcoming' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'All events' }));
  await waitFor(() => expect(listPublicEvents.mock.lastCall[0]).not.toHaveProperty('state'));
  expect(listPublicEvents.mock.lastCall[0]).toMatchObject({ department: 'AI', limit: 100 });
  expect(new URLSearchParams(screen.getByTestId('location').textContent.split('?')[1]).get('state')).toBe('ALL');
});

test('This month clears only the month selection while preserving state, department and calendar view', async () => {
  show(<Events />, '/events?month=2001-01&state=ALL&department=AI&view=month');
  await userEvent.click(screen.getByRole('button', { name: 'This month' }));
  const current = zonedParts(new Date());
  await waitFor(() => expect(listPublicEvents).toHaveBeenLastCalledWith(expect.objectContaining({ from: monthStartIso(current.year, current.month), department: 'AI' })));
  const params = new URLSearchParams(screen.getByTestId('location').textContent.split('?')[1]);
  expect(params.has('month')).toBe(false);
  expect(params.get('state')).toBe('ALL');
  expect(params.get('department')).toBe('AI');
  expect(params.get('view')).toBe('month');
  expect(screen.queryByRole('button', { name: 'This month' })).not.toBeInTheDocument();
});

test('professor results use the server total and Clear filters resets keyword, department and page together', async () => {
  const professor = { id: 'professor', name: 'Example Professor', position: 'PROFESSOR', department: 'AI', officeRoom: '101', officeBuilding: 'Main', email: 'example@example.edu', subjects: ['Machine Learning'], counsellingHours: [] };
  listProfessors.mockImplementation(async params => params.q || params.department ? {
    data: [professor], meta: { total: 31, page: 2, totalPages: 2, departmentCounts: { AI: 31, ALL: 31 } },
  } : { data: [], meta: { total: 0, page: 1, totalPages: 1, departmentCounts: {} } });
  show(<Professors />, '/professors?q=Machine&department=AI&page=2');
  expect(await screen.findByText('31 professors found')).toBeInTheDocument();
  expect(screen.getByText('Room 101, Main')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByTestId('location').textContent).toBe('/professors');
  expect(screen.getByLabelText('Search by name, subject or room')).toHaveValue('');
  expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  expect(screen.getByText('Choose a department or search for a professor')).toBeInTheDocument();
  expect(listProfessors).toHaveBeenCalledTimes(1);
});

test('the directory waits for a department or search term and sends room searches with the selected department', async () => {
  show(<Professors />, '/professors');
  expect(await screen.findByRole('option', { name: 'Artificial Intelligence (1)' })).toBeInTheDocument();
  expect(listProfessors).not.toHaveBeenCalled();
  await userEvent.selectOptions(screen.getByLabelText('Department'), 'AI');
  await waitFor(() => expect(listProfessors).toHaveBeenLastCalledWith({ department: 'AI', q: '', page: 1, limit: 30 }));
  await userEvent.type(screen.getByLabelText('Search by name, subject or room'), '1222');
  await waitFor(() => expect(listProfessors).toHaveBeenLastCalledWith({ department: 'AI', q: '1222', page: 1, limit: 30 }));
});
