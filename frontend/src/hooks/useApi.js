import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * useApi(fetcher, deps) -> { data, error, loading, reload, setData }
 * Runs the fetcher when deps change and ignores stale responses.
 */
export default function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ request: null, data: null, error: null });
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestKey = JSON.stringify([...deps, reloadVersion]);
  const request = useMemo(() => ({ key: requestKey }), [requestKey]);
  const reload = useCallback(() => {
    setReloadVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(fetcher)
      .then(
        (data) => active && setState({ request, data, error: null }),
        (error) => active && setState({ request, data: null, error })
      );
    return () => {
      active = false;
    };
    // The caller lists the values that change the request in deps. Inline
    // fetchers intentionally do not restart a request on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  const loading = state.request !== request;
  return { data: loading ? null : state.data, error: loading ? null : state.error, loading, reload, setData };
}
