import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import useDepartments, { invalidateDepartments } from '../hooks/useDepartments';
import { listDepartments } from '../api/notices';

vi.mock('../api/notices', () => ({ listDepartments: vi.fn() }));

test('a stale empty response cannot replace newly created department options', async () => {
  let finishOldRequest;
  const created = [{ id: 'department-1', code: 'ENG', name: 'Engineering', displayOrder: 0 }];
  invalidateDepartments();
  listDepartments.mockImplementationOnce(() => new Promise((resolve) => { finishOldRequest = resolve; }));
  listDepartments.mockResolvedValueOnce(created);
  const oldScreen = renderHook(() => useDepartments());
  await waitFor(() => expect(listDepartments).toHaveBeenCalledTimes(1));
  oldScreen.unmount();
  invalidateDepartments();
  const updatedScreen = renderHook(() => useDepartments());
  await waitFor(() => expect(updatedScreen.result.current.departments).toEqual(created));
  await act(async () => finishOldRequest([]));
  updatedScreen.unmount();
  const nextScreen = renderHook(() => useDepartments());
  expect(nextScreen.result.current.departments).toEqual(created);
  expect(listDepartments).toHaveBeenCalledTimes(2);
});
