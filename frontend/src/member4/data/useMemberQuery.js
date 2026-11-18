import { useCallback, useEffect, useState } from 'react';
import api from '../../api/client.js';

// Personal responses stay in component memory, never browser storage or a shared cache.
export default function useMemberQuery(path) {
  const [result, setResult] = useState({ path: null, data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api.get(path, { signal: controller.signal })
      .then((response) => { if (active) setResult({ path, data: response.data, error: null }); })
      .catch((error) => { if (active) setResult({ path, data: null, error }); });
    return () => { active = false; controller.abort(); };
  }, [path, attempt]);
  const reload = useCallback(() => {
    setResult({ path: null, data: null, error: null });
    setAttempt((current) => current + 1);
  }, []);
  return { loading: result.path !== path, data: result.path === path ? result.data : null, error: result.path === path ? result.error : null, reload };
}
