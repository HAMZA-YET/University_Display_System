import PageHeader from '../components/layout/PageHeader';
import FilterBar from '../components/notices/FilterBar';
import NoticeCard from '../components/notices/NoticeCard';
import Pagination from '../components/ui/Pagination';
import { DataState } from '../components/ui/States';
import useApi from '../hooks/useApi';
import useQueryParams from '../hooks/useQueryParams';
import useDepartments from '../hooks/useDepartments';
import { listPublicNotices } from '../api/notices';

const KEYS = ['q', 'category', 'department', 'audience', 'from', 'to', 'page'];

export default function Notices() {
  const [params, setParams] = useQueryParams(KEYS);
  const { departments, byCode } = useDepartments();
  const result = useApi(() => listPublicNotices({ ...params, page: params.page || 1 }), [JSON.stringify(params)]);

  return (
    <>
      <PageHeader title="Campus notices" description="Your place for university updates, opportunities, and announcements." />
      <FilterBar params={params} setParams={setParams} departments={departments} />
      <div aria-live="polite" className="small muted" style={{ margin: 'var(--space-3) 0' }}>
        {result.data && `${result.data.meta.total} notice${result.data.meta.total === 1 ? '' : 's'} found`}
      </div>
      <DataState {...result} onRetry={result.reload} isEmpty={(d) => !d.data.length} emptyTitle="No notices match your filters" emptyText="Try a different keyword or clear the filters.">
        {(d) => (
          <>
            <div className="grid grid-2">
              {d.data.map((n) => (
                <NoticeCard key={n.id} notice={n} departments={byCode} />
              ))}
            </div>
            <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />
          </>
        )}
      </DataState>
    </>
  );
}
