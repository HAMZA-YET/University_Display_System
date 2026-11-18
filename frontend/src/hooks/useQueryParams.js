import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filters, search text and page live in the URL so links can be shared and
 * the back button works. Changing any filter resets the page to 1.
 */
export default function useQueryParams(keys) {
  const [searchParams, setSearchParams] = useSearchParams();
  const keyList = keys.join('|');

  const params = useMemo(() => {
    const out = {};
    keyList.split('|').forEach((k) => {
      out[k] = searchParams.get(k) || '';
    });
    return out;
  }, [searchParams, keyList]);

  const setParams = useCallback(
    (changes, { replace = false } = {}) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(changes).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) next.delete(k);
        else next.set(k, String(v));
      });
      if (!('page' in changes)) next.delete('page');
      setSearchParams(next, { replace });
    },
    [searchParams, setSearchParams]
  );

  return [params, setParams];
}
