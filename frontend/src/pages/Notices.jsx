import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import FilterBar from '../components/notices/FilterBar';
import NoticeBoardCard from '../components/notices/NoticeBoardCard';
import Icon from '../components/ui/Icon';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { DataState, EmptyState } from '../components/ui/States';
import useApi from '../hooks/useApi';
import useQueryParams from '../hooks/useQueryParams';
import useDepartments from '../hooks/useDepartments';
import { listPublicNotices } from '../api/notices';
import { humanize } from '../lib/labels';
import '../styles/notices.css';

const KEYS = ['q', 'category', 'department', 'audience', 'from', 'to', 'page'];

export default function Notices() {
  const location = useLocation();
  const [params, setParams] = useQueryParams(KEYS);
  const { departments, byCode } = useDepartments();
  const result = useApi(() => listPublicNotices({ ...params, page: params.page || 1 }), [JSON.stringify(params)]);
  const resultsHeading = useRef(null);
  useEffect(() => {
    if (location.state?.focusReturn && !result.loading) resultsHeading.current?.focus();
  }, [location.state?.focusReturn, result.loading]);

  return (
    <div className="notices-page">
      <div className="notice-bulletin-heading">
        <div><p className="notice-bulletin-eyebrow">The campus bulletin</p><PageHeader title="Campus notices" description="Your place for university updates, opportunities, and announcements." /></div>
        <Link className="notice-calendar-link" to="/events"><span><Icon name="calendar" size={21} /></span><span>Make room for what’s next<small>Explore campus events<Icon name="arrowRight" size={14} /></small></span></Link>
      </div>
      <FilterBar params={params} setParams={setParams} departments={departments} />
      <div className="notice-results-heading">
        <div><span className="notice-results-rule" aria-hidden="true" /><h2 ref={resultsHeading} tabIndex={-1}>{params.category ? `${humanize(params.category)} notices` : 'Notice board'}</h2><span aria-live="polite" className="notice-result-count">{result.data && `${result.data.meta.total} notice${result.data.meta.total === 1 ? '' : 's'} found`}</span></div>
        <p><Icon name="pin" size={13} />Priority notices appear first</p>
      </div>
      <DataState {...result} onRetry={result.reload} isEmpty={(d) => d.meta.total === 0} emptyTitle="No notices match your filters" emptyText="Try a different keyword or clear the filters.">
        {(d) => (
          <>
            {d.data.length > 0 ? <div className="notice-board-grid">
              {d.data.map((n, index) => (
                <NoticeBoardCard key={n.id} notice={n} departments={byCode} returnTo={location.pathname + location.search} featured={index === 0 && (n.pinned || ['URGENT', 'HIGH'].includes(n.priority))} />
              ))}
            </div> : <EmptyState title="No notices on this page"><p>Notices are available for these filters. Return to the first page to view them.</p><Button variant="secondary" onClick={() => setParams({ page: 1 })}>Return to first page</Button></EmptyState>}
            {d.data.length > 0 && <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />}
          </>
        )}
      </DataState>
    </div>
  );
}
