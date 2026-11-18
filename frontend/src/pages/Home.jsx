import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import NoticeCard from '../components/notices/NoticeCard';
import EventCard from '../components/events/EventCard';
import Button from '../components/ui/Button';
import { DataState } from '../components/ui/States';
import useApi from '../hooks/useApi';
import useDepartments from '../hooks/useDepartments';
import { getHome } from '../api/notices';
import { listPublicEvents } from '../api/events';
import { professorDepartments } from '../api/professors';

export default function Home() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { byCode } = useDepartments();
  const home = useApi(() => getHome(), []);
  const events = useApi(() => listPublicEvents({ state: 'UPCOMING', limit: 5 }), []);
  const depts = useApi(() => professorDepartments(), []);

  return (
    <>
      <PageHeader title="KDU Global Information Display" description="Official notices, events and the professor directory of KDU Global (Kyungdong University)." />

      <form
        className="panel"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/notices${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
        }}
      >
        <label htmlFor="home-search" style={{ fontWeight: 700, display: 'block', marginBottom: 'var(--space-2)' }}>
          Search notices
        </label>
        <div className="row">
          <input id="home-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: scholarship, exam, dormitory" style={{ flex: 1, minWidth: 200 }} />
          <Button type="submit" icon="search">
            Search
          </Button>
        </div>
      </form>

      <div className="grid grid-sidebar" style={{ marginTop: 'var(--space-5)' }}>
        <div className="stack">
          <section className="panel" aria-labelledby="important-title">
            <div className="panel-title">
              <h2 id="important-title">Important and pinned notices</h2>
            </div>
            <DataState {...home} onRetry={home.reload} isEmpty={(d) => !d.important.length} emptyTitle="No important notices right now">
              {(d) => (
                <div className="stack">
                  {d.important.map((n) => (
                    <NoticeCard key={n.id} notice={n} departments={byCode} />
                  ))}
                </div>
              )}
            </DataState>
          </section>

          <section className="panel" aria-labelledby="latest-title">
            <div className="panel-title">
              <h2 id="latest-title">Latest notices</h2>
              <Link to="/notices">All notices</Link>
            </div>
            <DataState {...home} onRetry={home.reload} isEmpty={(d) => !d.latest.length} emptyTitle="No notices published yet">
              {(d) => (
                <div className="grid grid-2">
                  {d.latest.map((n) => (
                    <NoticeCard key={n.id} notice={n} departments={byCode} />
                  ))}
                </div>
              )}
            </DataState>
          </section>
        </div>

        <div className="stack">
          <section className="panel" aria-labelledby="events-title">
            <div className="panel-title">
              <h2 id="events-title">Upcoming events</h2>
              <Link to="/events">Calendar</Link>
            </div>
            <DataState {...events} onRetry={events.reload} isEmpty={(d) => !d.data.length} emptyTitle="No upcoming events">
              {(d) => (
                <div className="stack">
                  {d.data.map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              )}
            </DataState>
          </section>

          <section className="panel" aria-labelledby="prof-title">
            <div className="panel-title">
              <h2 id="prof-title">Professor directory</h2>
              <Link to="/professors">Open</Link>
            </div>
            <DataState {...depts} onRetry={depts.reload} isEmpty={(d) => !d.length} emptyTitle="No departments">
              {(d) => (
                <div className="dept-tiles" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  {d.map((dept) => (
                    <Link key={dept.code} className="dept-tile" to={`/professors?department=${dept.code}`} title={dept.name}>
                      <span>{dept.code === 'KS' ? 'Korean Studies' : dept.code}</span>
                      <span className="small">{dept.count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </DataState>
          </section>
        </div>
      </div>
    </>
  );
}
