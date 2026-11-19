import { useEffect, useState } from 'react';
import ItemCard from '../../components/lostFound/ItemCard';
import LfCategoryIcon from '../../components/lostFound/LfCategoryIcon';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import useAuth from '../../hooks/useAuth';
import useDebounce from '../../hooks/useDebounce';
import useQueryParams from '../../hooks/useQueryParams';
import { listPublicItems } from '../../api/lostFound';
import { LF_CATEGORIES, lfLabel } from '../../lib/lostFoundLabels';

const TYPES = [
  { value: '', label: 'All', noun: 'items' },
  { value: 'FOUND', label: 'Found Items', noun: 'found items' },
  { value: 'LOST', label: 'Lost Items', noun: 'lost items' },
];

/** Public Lost & Found home. Students and the admin see the same list. */
export default function LostFoundBrowse() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [params, setParams] = useQueryParams(['type', 'category', 'q', 'page']);
  const [q, setQ] = useState(params.q);
  const debounced = useDebounce(q, 300);

  useEffect(() => {
    document.title = 'Lost and Found - KDU Global UIDS';
  }, []);
  useEffect(() => setQ(params.q), [params.q]);
  useEffect(() => {
    if (debounced !== params.q) setParams({ q: debounced }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const result = useApi(
    () => listPublicItems({ type: params.type, category: params.category, q: params.q, page: params.page || 1, limit: 12 }),
    [params.type, params.category, params.q, params.page]
  );
  const current = TYPES.find((t) => t.value === params.type) || TYPES[0];
  const filtered = Boolean(params.q || params.category);

  return (
    <>
      <section className="lf-hero centered" aria-labelledby="lf-hero-title">
        <h1 id="lf-hero-title">Lost something? Found something?</h1>
        <p>
          Search items reported around KDU Global. Found items wait safely at the office; ownership is checked privately before anything is
          handed over.
        </p>
        <form className="lf-hero-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="lf-search" className="visually-hidden">
            Search lost and found
          </label>
          <input
            id="lf-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Try 'umbrella', 'library' or a reference like LF-2026-00001"
          />
        </form>
        <div className="lf-hero-actions">
          {isAdmin && (
            <Button to="/admin/lost-found" icon="building">
              Admin Dashboard
            </Button>
          )}
          {user && !isAdmin && (
            <>
              <Button variant="secondary" to="/lost-found/my-cases" icon="list">
                My Cases
              </Button>
              <Button to="/lost-found/report" icon="plus">
                Report an item
              </Button>
            </>
          )}
          {!user && (
            <Button to="/login" state={{ from: '/lost-found/report' }} icon="user">
              Log in to report an item
            </Button>
          )}
        </div>
      </section>

      <div className="stack">
        <div className="lf-chips" role="group" aria-label="Item type">
          {TYPES.map((t) => (
            <button
              key={t.value || 'all'}
              type="button"
              className="lf-chip"
              aria-pressed={params.type === t.value}
              onClick={() => setParams({ type: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="lf-count" aria-live="polite">
          {result.data ? (
            <>
              Showing <strong>{result.data.meta.total}</strong>{' '}
              {result.data.meta.total === 1 ? current.noun.replace(/s$/, '') : current.noun}
              {filtered ? ' matching your search' : ''}
            </>
          ) : (
            ' '
          )}
        </p>
        <div className="lf-chips" role="group" aria-label="Category">
          {LF_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className="lf-chip"
              aria-pressed={params.category === c}
              onClick={() => setParams({ category: params.category === c ? '' : c })}
            >
              <LfCategoryIcon category={c} size={18} />
              {lfLabel(c)}
            </button>
          ))}
          {filtered && (
            <Button variant="ghost" size="sm" icon="close" onClick={() => setParams({ q: '', category: '' })}>
              Clear
            </Button>
          )}
        </div>

        <DataState
          {...result}
          onRetry={result.reload}
          isEmpty={(d) => !d.data.length}
          emptyTitle={filtered ? 'Nothing matches yet' : 'Nothing listed right now'}
          emptyText={filtered ? 'Try fewer words or another category.' : 'New reports appear here as soon as they are posted.'}
        >
          {(d) => (
            <>
              <div className="lf-grid">
                {d.data.map((item) => (
                  <ItemCard key={item.id} item={item} />
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
