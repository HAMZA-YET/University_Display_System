import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { DataState } from '../../components/ui/States';
import LfCategoryIcon from '../../components/lostFound/LfCategoryIcon';
import { BackToLostFound } from '../lostFound/LostFoundItem';
import useApi from '../../hooks/useApi';
import { adminStats } from '../../api/lostFound';
import { lfLabel, postedDate } from '../../lib/lostFoundLabels';

function ActionBox({ value, label, to }) {
  return (
    <Link to={to} className={`lf-kpi ${value ? 'attention' : ''}`}>
      <span className="value">{value}</span>
      <span className="label">{label}</span>
    </Link>
  );
}

function HeldList({ title, items, empty }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ol className="lf-timeline">
          {items.map((i) => (
            <li key={i.id}>
              <span className="when">
                Posted {postedDate(i.postedAt)} -{' '}
                <strong>
                  {i.daysListed} {i.daysListed === 1 ? 'day' : 'days'}
                </strong>{' '}
                listed
              </span>
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <Link to={`/admin/items/${i.id}`}>{i.title}</Link>
                <span className="mono small">{i.reference}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Admin Dashboard: everything the admin needs, one click from each number. */
export default function AdminLfDashboard() {
  const result = useApi(() => adminStats(), []);

  return (
    <>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <BackToLostFound />
      </div>
      <section className="lf-hero compact" aria-labelledby="lf-dash-title">
        <p className="eyebrow">ADMINISTRATION · LOST &amp; FOUND</p>
        <h1 id="lf-dash-title">Lost-and-found office</h1>
        <p>Today&apos;s work: review new reports, decide claims and record handovers.</p>
      </section>

      <DataState {...result} onRetry={result.reload}>
        {(s) => {
          const max = Math.max(1, ...s.byCategory.map((c) => c.total));
          return (
            <div className="stack">
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Action Needed</h2>
              <div className="lf-kpis three">
                <ActionBox value={s.actionNeeded.lostItems} label="Lost Items" to="/admin/lost-found/items?type=LOST" />
                <ActionBox value={s.actionNeeded.foundItems} label="Found Items" to="/admin/lost-found/items?type=FOUND" />
                <ActionBox value={s.actionNeeded.claimsWaiting} label="Claims Waiting" to="/admin/lost-found/claims?status=PENDING" />
              </div>

              <div>
                <Button to="/admin/lost-found/items" icon="list">
                  Show all Lost &amp; Found items
                </Button>
              </div>

              <section className="panel">
                <div className="panel-title">
                  <h2>Listed items by category</h2>
                  <div className="lf-legend">
                    <span className="found">Found</span>
                    <span className="lost">Lost</span>
                  </div>
                </div>
                {s.byCategory.length === 0 ? (
                  <p className="muted">No listed items.</p>
                ) : (
                  <div className="lf-bars">
                    {s.byCategory.map((c) => (
                      <Link key={c.category} to={`/admin/lost-found/items?category=${c.category}`} className="lf-bar-row lf-bar-link">
                        <span className="row" style={{ gap: 'var(--space-2)' }}>
                          <LfCategoryIcon category={c.category} size={18} /> {lfLabel(c.category)}
                        </span>
                        <span className="lf-bar-track" role="img" aria-label={`${c.FOUND} found, ${c.LOST} lost`}>
                          <span className="lf-bar-found" style={{ width: `${(c.FOUND / max) * 100}%` }} />
                          <span className="lf-bar-lost" style={{ width: `${(c.LOST / max) * 100}%` }} />
                        </span>
                        <strong style={{ textAlign: 'right' }}>{c.total}</strong>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              <div className="grid grid-2">
                <HeldList title="Found items held longest" items={s.longestFound} empty="No found items are listed." />
                <HeldList title="Lost items held longest" items={s.longestLost} empty="No lost items are listed." />
              </div>
            </div>
          );
        }}
      </DataState>
    </>
  );
}
