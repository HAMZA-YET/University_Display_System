import { useEffect, useMemo, useState } from 'react';
import { listDepartments } from '../api/notices';

let cache = null;
let cacheGeneration = 0;

/** Call after a confirmed change so the next screen gets current options. */
export function invalidateDepartments() {
  cache = null;
  cacheGeneration += 1;
}

/** Departments from the API (never hard-coded in React). Cached per page load. */
export default function useDepartments() {
  const [departments, setDepartments] = useState(cache || []);
  useEffect(() => {
    if (cache) return;
    let active = true;
    const generation = cacheGeneration;
    listDepartments()
      .then((list) => {
        if (generation !== cacheGeneration) return;
        cache = list;
        if (active) setDepartments(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const byCode = useMemo(() => Object.fromEntries(departments.map((d) => [d.code, d.name])), [departments]);
  return { departments, byCode };
}
