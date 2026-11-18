import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import { adminSummary } from '../../api/users';
import { formatDateTime } from '../../lib/time';
import { humanize } from '../../lib/labels';
import SampleContentPanel from '../../components/admin/SampleContentPanel';

const ORDER = ['DRAFT', 'SUBMITTED', 'RETURNED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'WITHDRAWN', 'ARCHIVED'];

export default function AdminDashboard() {
  const result = useApi(() => adminSummary(), []);
  return (
    <>
      <PageHeader
        title="Admin dashboard"
        description="Manage your campus information, people, and publishing activity."
        actions={
          <>
            <Button variant="secondary" to="/admin/users" icon="user">
              Users
            </Button>
            <Button variant="secondary" to="/admin/professors" icon="book">
              Professors
            </Button>
            <Button variant="secondary" to="/admin/departments" icon="building">
              Departments
            </Button>
          </>
        }
      />
      <SampleContentPanel onInstalled={result.reload} />
      <DataState {...result} onRetry={result.reload}>
        {(d) => (
          <div className="stack">
            <section aria-labelledby="counts-title">
              <h2 id="counts-title" style={{ fontSize: 'var(--text-lg)' }}>
                Notices by effective status
              </h2>
              <div className="stat-grid">
                {ORDER.map((s) => (
                  <div key={s} className="stat">
                    <div className="value">{d.countsByEffectiveStatus[s] || 0}</div>
                    <div className="label">{humanize(s)}</div>
                  </div>
                ))}
                <div className="stat" style={{ borderTopColor: 'var(--color-accent)' }}>
                  <div className="value">{d.pendingReviews}</div>
                  <div className="label">
                    <Link to="/reviewer/queue">Pending reviews</Link>
                  </div>
                </div>
                <div className="stat" style={{ borderTopColor: 'var(--color-accent)' }}>
                  <div className="value">{d.upcomingEvents}</div>
                  <div className="label">
                    <Link to="/events">Upcoming events</Link>
                  </div>
                </div>
              </div>
            </section>
            <div className="grid grid-2">
              <section className="panel">
                <div className="panel-title">
                  <h2>Recent domain events</h2>
                  <Link to="/admin/domain-events">All</Link>
                </div>
                <Table
                  caption="Recent domain events"
                  rowKey="eventId"
                  columns={[
                    { key: 'type', header: 'Type' },
                    { key: 'title', header: 'Title', render: (r) => (r.payload && r.payload.title) || '-' },
                    { key: 'timestamp', header: 'Time (KST)', render: (r) => formatDateTime(r.timestamp) },
                  ]}
                  rows={d.recentDomainEvents}
                  emptyText="No domain events yet."
                />
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h2>Recent audit entries</h2>
                </div>
                <Table
                  caption="Recent audit entries"
                  columns={[
                    { key: 'action', header: 'Action', render: (r) => humanize(r.action) },
                    { key: 'actor', header: 'Actor', render: (r) => (r.actor ? r.actor.name : '-') },
                    { key: 'change', header: 'Change', render: (r) => (r.fromStatus || r.toStatus ? `${r.fromStatus || '-'} to ${r.toStatus || '-'}` : '-') },
                    { key: 'timestamp', header: 'Time (KST)', render: (r) => formatDateTime(r.timestamp) },
                  ]}
                  rows={d.recentAudit}
                  emptyText="No audit entries yet."
                />
              </section>
            </div>
          </div>
        )}
      </DataState>
    </>
  );
}
