import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import useApi from '../hooks/useApi';
import useUrlInput from '../hooks/useUrlInput';

test('a slow previous API request cannot overwrite the current filters', async () => {
  const requests = new Map();
  const { result, rerender } = renderHook(
    ({ filter }) => useApi(() => new Promise((resolve) => requests.set(filter, resolve)), [filter]),
    { initialProps: { filter: 'old' } }
  );
  await waitFor(() => expect(requests.has('old')).toBe(true));
  rerender({ filter: 'new' });
  await waitFor(() => expect(requests.has('new')).toBe(true));
  await act(async () => requests.get('new')('Current results'));
  expect(result.current.data).toBe('Current results');
  await act(async () => requests.get('old')('Stale results'));
  expect(result.current.data).toBe('Current results');
});

test('reload exposes loading and retries a failed API request', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('Temporarily unavailable')).mockResolvedValueOnce('Ready');
  const { result } = renderHook(() => useApi(fetcher, []));
  await waitFor(() => expect(result.current.error?.message).toBe('Temporarily unavailable'));
  act(() => result.current.reload());
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.data).toBe('Ready'));
  expect(result.current.error).toBe(null);
});

test('returning to an earlier URL search clears an old local draft', () => {
  const { result, rerender } = renderHook(({ q }) => useUrlInput(q), { initialProps: { q: 'alpha' } });
  act(() => result.current[1]('beta'));
  expect(result.current[0]).toBe('beta');
  rerender({ q: 'beta' });
  act(() => result.current[1]('gamma'));
  rerender({ q: 'gamma' });
  rerender({ q: 'beta' });
  expect(result.current[0]).toBe('beta');
});
