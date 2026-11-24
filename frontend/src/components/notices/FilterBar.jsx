import { useEffect } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import useDebounce from '../../hooks/useDebounce';
import useUrlInput from '../../hooks/useUrlInput';
import { CATEGORIES, AUDIENCES, humanize } from '../../lib/labels';
import { fromLocalInput } from '../../lib/time';

/** Filter bar for the public notice list. Values are kept in the URL by the page. */
export default function FilterBar({ params, setParams, departments }) {
  const [q, setQ] = useUrlInput(params.q);
  const debouncedQ = useDebounce(q, 350);

  useEffect(() => {
    if (debouncedQ !== params.q) setParams({ q: debouncedQ }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const fromDate = params.from ? params.from.slice(0, 10) : '';
  const toDate = params.to ? params.to.slice(0, 10) : '';

  return (
    <form className="panel notice-filters" role="search" aria-label="Filter notices" onSubmit={(e) => e.preventDefault()}>
      <div className="notice-filter-grid">
        <Input label="Keyword" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, summary and text" />
        <Select
          label="Category"
          value={params.category}
          onChange={(e) => setParams({ category: e.target.value })}
          placeholder="All categories"
          options={CATEGORIES.map((c) => ({ value: c, label: humanize(c) }))}
        />
        <Select
          label="Department"
          value={params.department}
          onChange={(e) => setParams({ department: e.target.value })}
          placeholder="All departments"
          options={[{ value: 'ALL', label: 'University-wide notices' }, ...departments.map((d) => ({ value: d.code, label: d.name }))]}
        />
        <Select
          label="Audience"
          value={params.audience}
          onChange={(e) => setParams({ audience: e.target.value })}
          placeholder="Any audience"
          options={AUDIENCES.map((a) => ({ value: a, label: humanize(a) }))}
        />
        <Input
          label="Published from"
          type="date"
          value={fromDate}
          onChange={(e) => setParams({ from: e.target.value ? fromLocalInput(`${e.target.value}T00:00`) : '' })}
          hint="Korea Standard Time"
        />
        <Input
          label="Published to"
          type="date"
          value={toDate}
          onChange={(e) => setParams({ to: e.target.value ? fromLocalInput(`${e.target.value}T23:59`) : '' })}
          hint="Korea Standard Time"
        />
      </div>
      <div className="row notice-filter-actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setQ('');
            setParams({ q: '', category: '', department: '', audience: '', from: '', to: '' });
          }}
        >
          Clear filters
        </Button>
      </div>
    </form>
  );
}
