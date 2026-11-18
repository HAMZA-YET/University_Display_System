import { useEffect, useMemo, useState } from 'react';
import { listDepartments } from '../api/notices';

let cache = null;

/** Departments from the API (never hard-coded in React). Cached per page load. */
export default function useDepartments() {
  const [departments, setDepartments] = useState(cache || []);
  useEffect(() => {
    if (cache) return;
    let active = true;
    listDepartments()
      .then((list) => {
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
