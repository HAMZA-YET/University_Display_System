import { useMemo } from 'react';
import PageHeader from '../components/layout/PageHeader';
import EventList from '../components/events/EventList';
import EventCalendar from '../components/events/EventCalendar';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import { DataState } from '../components/ui/States';
import useApi from '../hooks/useApi';
import useQueryParams from '../hooks/useQueryParams';
import useDepartments from '../hooks/useDepartments';
import { listPublicEvents } from '../api/events';
import { zonedParts, monthStartIso } from '../lib/time';

const TABS = [
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'POSTPONED', label: 'Postponed' },
];

/**
 * List and Month views are two renderings of ONE API response (same endpoint,
 * same filters, same state calculation), so they always agree.
 */
export default function Events() {
  const [params, setParams] = useQueryParams(['state', 'view', 'month', 'department']);
  const { departments } = useDepartments();
  const state = params.state || 'UPCOMING';
  const view = params.view || 'list';

  const { year, month } = useMemo(() => {
    if (/^\d{4}-\d{2}$/.test(params.month)) {
      const [y, m] = params.month.split('-').map(Number);
      if (y >= 1000 && m >= 1 && m <= 12) return { year: y, month: m - 1 };
    }
    const now = zonedParts(new Date());
    return { year: now.year, month: now.month };
  }, [params.month]);

  const from = monthStartIso(year, month);
  const to = month === 11 ? monthStartIso(year + 1, 0) : monthStartIso(year, month + 1);
  const result = useApi(() => listPublicEvents({ state, from, to, department: params.department, limit: 100 }), [state, from, to, params.department]);

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shift = (delta) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setParams({ month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` });
  };

  return (
    <>
      <PageHeader title="Events & activities" description="Discover what's happening around campus. All times are shown in Korea Standard Time (Asia/Seoul)." />
      <div className="stack">
        <div className="tabs" role="group" aria-label="Filter by event state">
          {TABS.map((t) => (
            <button key={t.value} type="button" aria-pressed={state === t.value} onClick={() => setParams({ state: t.value })}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="row-between">
          <div className="row" role="group" aria-label="Month">
            <Button variant="secondary" size="sm" icon="chevronLeft" onClick={() => shift(-1)} aria-label="Previous month">
              Prev
            </Button>
            <strong aria-live="polite">{monthLabel}</strong>
            <Button variant="secondary" size="sm" onClick={() => shift(1)} aria-label="Next month">
              Next
            </Button>
          </div>
          <div className="row">
            <div style={{ minWidth: 220 }}>
              <Select
                label="Department"
                value={params.department}
                onChange={(e) => setParams({ department: e.target.value })}
                placeholder="All departments"
                options={[{ value: 'ALL', label: 'University-wide' }, ...departments.map((d) => ({ value: d.code, label: d.name }))]}
              />
            </div>
            <div className="row" role="group" aria-label="View">
              <Button variant={view === 'list' ? 'primary' : 'secondary'} size="sm" icon="list" aria-pressed={view === 'list'} onClick={() => setParams({ view: 'list' })}>
                List
              </Button>
              <Button variant={view === 'month' ? 'primary' : 'secondary'} size="sm" icon="calendar" aria-pressed={view === 'month'} onClick={() => setParams({ view: 'month' })}>
                Month
              </Button>
            </div>
          </div>
        </div>
        {view === 'month' && <p className="calendar-mobile-tip small muted">On a small screen? Switch to List for full event details.</p>}
        <DataState {...result} onRetry={result.reload}>
          {(d) => (view === 'month' ? <EventCalendar year={year} month={month} events={d.data} /> : <EventList events={d.data} />)}
        </DataState>
      </div>
    </>
  );
}
