import { useEffect, useId, useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import useDebounce from '../../hooks/useDebounce';
import useUrlInput from '../../hooks/useUrlInput';
import { CATEGORIES, AUDIENCES, humanize } from '../../lib/labels';
import { fromLocalInput } from '../../lib/time';

/** Filter bar for the public notice list. Values are kept in the URL by the page. */
export default function FilterBar({ params, setParams, departments }) {
  const [q, setQ] = useUrlInput(params.q);
  const debouncedQ = useDebounce(q, 350);
  const advancedId = useId();
  const advancedKeys = ['department', 'audience', 'from', 'to'];
  const advancedCount = advancedKeys.filter((key) => params[key]).length;
  const [expanded, setExpanded] = useState(advancedCount > 0);

  useEffect(() => {
    if (debouncedQ !== params.q) setParams({ q: debouncedQ }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const fromDate = params.from ? params.from.slice(0, 10) : '';
  const toDate = params.to ? params.to.slice(0, 10) : '';
  const filterLabels = {
    q: `Search: ${params.q}`,
    category: humanize(params.category),
    department: params.department === 'ALL' ? 'University-wide' : departments.find((department) => department.code === params.department)?.name || params.department,
    audience: `${humanize(params.audience)} audience`,
    from: `From ${fromDate}`,
    to: `Through ${toDate}`,
  };
  const activeKeys = ['q', 'category', ...advancedKeys].filter((key) => params[key]);

  return (
    <form className="panel notice-filters" role="search" aria-label="Filter notices" onSubmit={(e) => e.preventDefault()}>
      <div className="notice-filter-primary">
        <Input className="notice-keyword" label="Keyword" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notices" />
        <Select
          label="Category"
          value={params.category}
          onChange={(e) => setParams({ category: e.target.value })}
          placeholder="All categories"
          options={CATEGORIES.map((c) => ({ value: c, label: humanize(c) }))}
        />
      </div>
      <div className="notice-filter-tools">
        <button type="button" className="notice-filter-toggle" aria-expanded={expanded} aria-controls={advancedId} onClick={() => setExpanded(!expanded)}><Icon name="list" size={17} />More filters{advancedCount > 0 && <span className="notice-filter-count">{advancedCount}</span>}<Icon className="notice-filter-chevron" name="chevronDown" size={14} /></button>
        <Button variant="ghost" size="sm" onClick={() => {
          setQ('');
          setParams({ q: '', category: '', department: '', audience: '', from: '', to: '' });
        }}>Clear filters</Button>
      </div>
      <div className="notice-filter-grid notice-filter-advanced" id={advancedId} hidden={!expanded}>
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
      {activeKeys.length > 0 && <div className="notice-active-filters" aria-label="Active notice filters">{activeKeys.map((key) => <button key={key} type="button" onClick={() => {
        if (key === 'q') setQ('');
        setParams({ [key]: '' });
      }} aria-label={`Remove filter: ${filterLabels[key]}`}>{filterLabels[key]}<Icon name="close" size={12} /></button>)}</div>}
    </form>
  );
}
