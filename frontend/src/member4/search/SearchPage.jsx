import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CATEGORIES, humanize } from '../../lib/labels.js';
import api from '../../api/client.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import NoticeCard from '../../components/notices/NoticeCard.jsx';
import ProfessorCard from '../../components/professors/ProfessorCard.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import useDepartments from '../../hooks/useDepartments.js';
import useAuth from '../../hooks/useAuth.js';
import { LF_CATEGORIES, lfLabel } from '../../lib/lostFoundLabels.js';
import { SEARCH_SOURCES, parseLiveSearch, liveSearchParams, searchConnectedRecords } from './liveSearch.js';

const request = (path, config) => api.get(path, config).then((response) => response.data);

export default function SearchPage() {
  const { search, state } = useLocation();
  const { user } = useAuth();
  return <ConnectedSearch key={`${user?.id || user?._id || 'guest'}:${search}`} search={search} signedIn={Boolean(user)} focusReturn={state?.focusReturn} />;
}

function ConnectedSearch({ search, signedIn, focusReturn }) {
  const [, setSearchParams] = useSearchParams();
  const parsed = parseLiveSearch(search);
  const [draft, setDraft] = useState(parsed.state);
  const [result, setResult] = useState({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const { departments, byCode } = useDepartments();
  const resultsHeading = useRef(null);

  useEffect(() => {
    if (focusReturn && result.kind !== 'loading') resultsHeading.current?.focus();
  }, [focusReturn, result.kind]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    searchConnectedRecords(search, { request, signal: controller.signal, signedIn })
      .then((data) => { if (active) setResult(data); })
      .catch((error) => { if (active) setResult({ kind: 'error', error }); });
    return () => { active = false; controller.abort(); };
  }, [search, attempt, signedIn]);

  function submit(event) {
    event.preventDefault();
    setSearchParams(liveSearchParams({ ...draft, page: 1 }));
    setResult({ kind: 'loading' });
    setAttempt((value) => value + 1);
  }

  function retry() {
    setResult({ kind: 'loading' });
    setAttempt((value) => value + 1);
  }

  function clear() {
    setDraft(parseLiveSearch('').state);
    retry();
  }

  const state = result.state || parsed.state;
  return (
    <>
      <PageHeader title="Search campus information" description="Search notices and professors, or sign in to find lost-and-found reports." />
      <div className="stack">
        <form className="card stack" onSubmit={submit}>
          <div className="grid grid-3">
            <Select label="Search in" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value, department: ['item', 'all'].includes(event.target.value) || draft.department === 'ALL' ? '' : draft.department, category: '', from: '', to: '', sort: 'default' })} options={Object.entries(SEARCH_SOURCES).map(([value, source]) => ({ value, label: source.label }))} />
            <Input label="Search text" type="search" maxLength={100} value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder={draft.source === 'professor' ? 'Name or subject' : draft.source === 'notice' ? 'Notice title or content' : 'Campus information'} />
            {['notice', 'professor'].includes(draft.source) && <Select label="Department" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} placeholder="All departments" options={[...(draft.source === 'notice' ? [{ value: 'ALL', label: 'University-wide' }] : []), ...departments.map((department) => ({ value: department.code, label: department.name }))]} />}
            {draft.source === 'item' && <Select label="Item category" placeholder="All categories" value={draft.category} options={LF_CATEGORIES.map((value) => ({ value, label: lfLabel(value) }))} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />}
          </div>
          {draft.source === 'notice' && <div className="grid grid-2">
            <Select label="Notice category" placeholder="All categories" value={draft.category} options={CATEGORIES.map((value) => ({ value, label: humanize(value) }))} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
            <Select label="Sort notices" value={draft.sort} options={[{ value: 'default', label: 'University priority order' }, { value: 'newest', label: 'Newest publication first' }]} onChange={(event) => setDraft({ ...draft, sort: event.target.value })} />
            <Input label="Published from (KST, inclusive)" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
            <Input label="Published through (KST, inclusive)" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
          </div>}
          <div className="row">
            <Button type="submit" icon="search">Search</Button>
            <Link to="/search" onClick={clear}>Clear search</Link>
          </div>
        </form>
        <p className="small muted">Results come from the connected university service. Browse the <Link to="/events">event calendar</Link> or <Link to="/items">lost and found</Link>. All sources uses alphabetical title order; visitors see notices and professors only.</p>
        <section aria-labelledby="campus-search-results" aria-busy={result.kind === 'loading'}>
          <h2 id="campus-search-results" ref={resultsHeading} tabIndex={-1}>Search results</h2>
          {result.kind === 'loading' && <LoadingState label="Searching public information…" />}
          {result.kind === 'error' && <ErrorState error={result.error} onRetry={retry} title="Search could not be completed" />}
          {result.kind === 'invalid' && <div className="state-box" role="alert"><h3>Check the search filters</h3>{result.errors.map((error) => <p key={error}>{error}</p>)}<Link to="/search">Reset search</Link></div>}
          {result.kind === 'signin' && <EmptyState title="Sign in to search lost and found"><Link to="/login" state={{ from: '/search' + search }}>Log in</Link></EmptyState>}
          {result.kind === 'results' && <>
            <p role="status">{result.meta.total} {result.meta.total === 1 ? 'result' : 'results'} in {SEARCH_SOURCES[state.source].label.toLowerCase()}</p>
            {result.records.length === 0 ? <EmptyState title={result.meta.total ? 'No results on this page' : 'No matching information'}><p>Try another search term or department.</p>{state.page > 1 && <button className="btn btn-secondary" type="button" onClick={() => setSearchParams(liveSearchParams({ ...state, page: 1 }))}>Return to first page</button>}</EmptyState> : <div className="grid grid-3">{result.records.map((record) => state.source === 'professor' ? <ProfessorCard key={record.id} professor={record} departmentName={byCode[record.department]} /> : state.source === 'notice' ? <NoticeCard key={record.id} notice={record} departments={byCode} returnTo={"/search" + search} /> : <article className="card stack" key={`${record.source || state.source}:${record.id}`}><span className="tag">{SEARCH_SOURCES[record.source || state.source]?.label}</span><h3><Link to={record.href || `/items/${record.id}`} state={{ returnTo: "/search" + search }}>{record.title}</Link></h3><p>{record.summary || record.description}</p></article>)}</div>}
            <Pagination meta={result.meta} onPage={(page) => setSearchParams(liveSearchParams({ ...state, page }))} />
          </>}
        </section>
      </div>
    </>
  );
}
