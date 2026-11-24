import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProfessorForm from '../components/professors/ProfessorForm';

test('an official profile can retain unpublished fields without fabricating required data', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<ProfessorForm professor={{ id: 'official', name: 'Faculty Fixture', position: 'INSTRUCTOR', positionLabel: 'KAP Instructor', sourceKey: 'kdu-global:fixture', officeRoom: null, officeBuilding: null, email: null, department: null, subjects: [], counsellingHours: [], isActive: true }} departments={[]} onSave={save} onCancel={() => {}} />);
  expect(screen.getByRole('combobox', { name: /Position/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const body = save.mock.calls[0][0];
  expect(body).toMatchObject({ department: null, officeRoom: null, officeBuilding: null, email: null, subjects: [], counsellingHours: [] });
  expect(body).not.toHaveProperty('sourceKey');
  expect(body).not.toHaveProperty('sourceUrl');
});
