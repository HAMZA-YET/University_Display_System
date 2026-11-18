import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminDepartments from '../pages/admin/AdminDepartments';
import * as departmentsApi from '../api/departments';

vi.mock('../api/departments', () => ({
  listDepartments: vi.fn(), createDepartment: vi.fn(), updateDepartment: vi.fn(), deleteDepartment: vi.fn(),
}));

const engineering = { id: 'department-1', code: 'ENG', name: 'Engineering', displayOrder: 1 };
const renderDepartments = () => render(<MemoryRouter><AdminDepartments /></MemoryRouter>);

describe('department management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    departmentsApi.listDepartments.mockResolvedValue([]);
  });

  test('creates the first department only after a successful save and refreshes the list', async () => {
    departmentsApi.createDepartment.mockImplementation(async (body) => {
      const created = { id: engineering.id, ...body };
      departmentsApi.listDepartments.mockResolvedValue([created]);
      return created;
    });
    renderDepartments();
    expect(await screen.findByText('No departments yet. Add your first department above.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Department code/), 'eng');
    await userEvent.type(screen.getByLabelText(/^Department name/), 'Engineering');
    await userEvent.clear(screen.getByLabelText(/^Display order/));
    await userEvent.type(screen.getByLabelText(/^Display order/), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
    await waitFor(() => expect(departmentsApi.createDepartment).toHaveBeenCalledWith({ code: 'ENG', name: 'Engineering', displayOrder: 2 }));
    expect(await screen.findByRole('button', { name: 'Edit ENG' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Department code/)).toHaveValue('');
  });

  test('edits name and order while keeping the original department code immutable', async () => {
    departmentsApi.listDepartments.mockResolvedValue([engineering]);
    departmentsApi.updateDepartment.mockResolvedValue({ ...engineering, name: 'Engineering Sciences', displayOrder: 4 });
    renderDepartments();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit ENG' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit ENG' }));
    expect(dialog.getByLabelText(/^Department code/)).toHaveAttribute('readonly');
    await userEvent.clear(dialog.getByLabelText(/^Department name/));
    await userEvent.type(dialog.getByLabelText(/^Department name/), 'Engineering Sciences');
    await userEvent.clear(dialog.getByLabelText(/^Display order/));
    await userEvent.type(dialog.getByLabelText(/^Display order/), '4');
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(departmentsApi.updateDepartment).toHaveBeenCalledWith(engineering.id, { name: 'Engineering Sciences', displayOrder: 4 }));
  });

  test('requires delete confirmation and keeps an in-use department when the server refuses deletion', async () => {
    departmentsApi.listDepartments.mockResolvedValue([engineering]);
    departmentsApi.deleteDepartment.mockRejectedValue(new Error('This department is in use. Edit its name instead.'));
    renderDepartments();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete ENG' }));
    expect(departmentsApi.deleteDepartment).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole('dialog', { name: 'Delete department' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Delete department' }));
    expect(await dialog.findByText('This department is in use. Edit its name instead.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit ENG' })).toBeInTheDocument();
    expect(screen.queryByText('Deleted Engineering.')).not.toBeInTheDocument();
  });

  test('keeps entered values and shows a duplicate-code error from the server', async () => {
    departmentsApi.createDepartment.mockRejectedValue(new Error('A department with this code already exists.'));
    renderDepartments();
    await userEvent.type(screen.getByLabelText(/^Department code/), 'ENG');
    await userEvent.type(screen.getByLabelText(/^Department name/), 'Engineering');
    await userEvent.click(screen.getByRole('button', { name: 'Add department' }));
    expect(await screen.findByText('A department with this code already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Department name/)).toHaveValue('Engineering');
  });
});
