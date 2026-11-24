import { useEffect } from 'react';
import PageHeader from '../components/layout/PageHeader';
import ProfessorCard from '../components/professors/ProfessorCard';
import DepartmentTabs from '../components/professors/DepartmentTabs';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { DataState } from '../components/ui/States';
import useApi from '../hooks/useApi';
import useDebounce from '../hooks/useDebounce';
import useUrlInput from '../hooks/useUrlInput';
import useQueryParams from '../hooks/useQueryParams';
import useDepartments from '../hooks/useDepartments';
import { listProfessors } from '../api/professors';

export default function Professors() {
  const [params, setParams] = useQueryParams(['department', 'q', 'page']);
  const { departments, byCode } = useDepartments();
  const [q, setQ] = useUrlInput(params.q);
  const debounced = useDebounce(q, 300);

  useEffect(() => {
    if (debounced !== params.q) setParams({ q: debounced }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const result = useApi(() => listProfessors({ department: params.department, q: params.q, page: params.page || 1, limit: 30 }), [params.department, params.q, params.page]);
  const counts = result.data ? result.data.meta.departmentCounts : {};
  const hasFilters = Boolean(q || params.q || params.department || params.page);
  const listedDepartments = result.data?.data.some((professor) => professor.sourceKey)
    ? departments.filter((department) => counts[department.code] > 0 || department.code === params.department)
    : departments;
  const resultLabel = result.data?.data.some((professor) => professor.sourceKey) ? 'faculty member' : 'professor';

  return (
    <>
      <PageHeader title="Professor Directory" description="Meet KDU Global faculty. Explore their roles, qualifications and published contact information." />
      <div className="stack">
        <Input label="Search by name or subject" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: Jebran or computer science" hint="You can also search published roles and qualifications." />
        <DepartmentTabs departments={listedDepartments} value={params.department} counts={counts} onChange={(department) => setParams({ department })} />
        {(result.data || hasFilters) && <div className="row-between">
          {result.data && <p className="small muted" role="status">{result.data.meta.total} {resultLabel}{result.data.meta.total === 1 ? '' : 's'} found</p>}
          {hasFilters && <Button variant="secondary" size="sm" onClick={() => {
            setQ('');
            setParams({ q: '', department: '', page: '' });
          }}>Clear filters</Button>}
        </div>}
        <DataState {...result} onRetry={result.reload} isEmpty={(d) => !d.data.length} emptyTitle="No professors found" emptyText="Try another department or search term.">
          {(d) => (
            <>
              {d.data.some((p) => p.sourceKey) && <p className="directory-source-note">Profiles and portraits are sourced from the <a href="https://www.kduniv.ac.kr/global/CMS/Contents/Contents.do?mCode=MN090" target="_blank" rel="noopener noreferrer">official KDU faculty page<span className="visually-hidden"> (opens in a new tab)</span></a>. Unpublished departments, teaching subjects, offices and counselling hours are left unspecified.</p>}
              <div className="grid grid-3">
                {d.data.map((p) => (
                  <ProfessorCard key={p.id} professor={p} departmentName={byCode[p.department]} />
                ))}
              </div>
              <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />
            </>
          )}
        </DataState>
      </div>
    </>
  );
}
