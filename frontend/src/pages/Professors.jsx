import { useEffect } from 'react';
import PageHeader from '../components/layout/PageHeader';
import ProfessorCard from '../components/professors/ProfessorCard';
import DepartmentFilter from '../components/professors/DepartmentFilter';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { DataState, EmptyState, ErrorState } from '../components/ui/States';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import useUrlInput from '../hooks/useUrlInput';
import useQueryParams from '../hooks/useQueryParams';
import { listProfessors, professorDepartments } from '../api/professors';

export default function Professors() {
  const [params, setParams] = useQueryParams(['department', 'q', 'page']);
  const directory = useApi(professorDepartments);
  const [q, setQ] = useUrlInput(params.q);
  const debounced = useDebounce(q, 300);

  useEffect(() => {
    const keyword = debounced.trim();
    if (keyword !== params.q.trim()) setParams({ q: keyword }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const showResults = Boolean(params.department || params.q.trim());
  const result = useApi(() => showResults
    ? listProfessors({ department: params.department, q: params.q, page: params.page || 1, limit: 30 })
    : null, [params.department, params.q, params.page]);
  const hasFilters = Boolean(q || params.q || params.department || params.page);
  const departments = directory.data || [];
  const listedDepartments = departments.filter(({ code, count }) => count > 0 || code === params.department);
  const byCode = Object.fromEntries(departments.map(({ code, name }) => [code, name]));
  const resultLabel = result.data?.data.some((professor) => professor.sourceKey) ? 'faculty member' : 'professor';

  return (
    <>
      <PageHeader title="Professor Directory" />
      <div className="stack">
        <div className="grid grid-2">
          <DepartmentFilter departments={listedDepartments} value={params.department} counts={result.data?.meta.departmentCounts} onChange={(department) => setParams({ department })} />
          <Input label="Search by name, subject or room" type="search" maxLength={100} value={q} onChange={(event) => setQ(event.target.value)} placeholder="For example: Jebran Khan or 1222" />
        </div>
        {directory.error && <ErrorState title="Departments could not be loaded" error={directory.error} onRetry={directory.reload} />}
        {(result.data || hasFilters) && <div className="row-between">
          {result.data && <p className="small muted" role="status">{result.data.meta.total} {resultLabel}{result.data.meta.total === 1 ? '' : 's'} found</p>}
          {hasFilters && <Button variant="secondary" size="sm" onClick={() => {
            setQ('');
            setParams({ q: '', department: '', page: '' });
          }}>Clear filters</Button>}
        </div>}
        {showResults ? (
          <DataState {...result} onRetry={result.reload} isEmpty={(d) => !d.data.length} emptyTitle="No professors found" emptyText="Try another department or search term.">
            {(d) => (
              <>
                {d.data.some((p) => p.sourceKey) && (
                  <p className="directory-source-note">
                    Sources: <a href="https://www.kduniv.ac.kr/global/CMS/Contents/Contents.do?mCode=MN090" target="_blank" rel="noopener noreferrer">KDU faculty profiles</a>
                    {' and '}
                    <a href="https://www.kduniv.ac.kr/kor/CMS/HaksaContactMgr/list3.do?mCode=MN239" target="_blank" rel="noopener noreferrer">Goseong campus contacts</a>.
                  </p>
                )}
                <div className="grid grid-3">
                  {d.data.map((p) => (
                    <ProfessorCard key={p.id} professor={p} departmentName={byCode[p.department]} />
                  ))}
                </div>
                <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />
              </>
            )}
          </DataState>
        ) : (
          <EmptyState title="Choose a department or search for a professor" />
        )}
      </div>
    </>
  );
}
