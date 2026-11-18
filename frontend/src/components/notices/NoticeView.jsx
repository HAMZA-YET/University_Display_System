import PriorityBadge from '../ui/PriorityBadge';
import Icon from '../ui/Icon';
import EventStatusBanner from '../events/EventStatusBanner';
import { formatDateTime, formatDate } from '../../lib/time';
import { humanize, formatBytes } from '../../lib/labels';

/**
 * Renders a notice in the public shape. Used by BOTH the public detail page
 * and the author preview, so the preview matches what students see.
 * The body is rendered as plain text (no HTML), which is safe by design.
 */
export default function NoticeView({ notice, departments = {}, preview = false }) {
  const deptName = notice.department === 'ALL' ? 'All departments' : departments[notice.department] || notice.department || '-';
  const paragraphs = String(notice.body || '').split(/\n{2,}/);
  return (
    <article className="notice-view" aria-labelledby="notice-title">
      <header>
        <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
          <PriorityBadge priority={notice.priority} pinned={notice.pinned} />
          {/\[(?:demo|sample)\]/i.test(notice.title) && <span className="sample-badge">Fictional sample notice</span>}
          {notice.category && <span className="tag">{humanize(notice.category)}</span>}
          <span className="tag">{deptName}</span>
          {notice.audience && <span className="tag">For: {humanize(notice.audience)}</span>}
          {notice.visibility === 'CAMPUS' && <span className="tag">Campus only</span>}
        </div>
        <h1 id="notice-title" style={{ marginBottom: 0 }}>
          {notice.title || 'Untitled notice'}
        </h1>
        {notice.summary && <p className="summary">{notice.summary}</p>}
        {notice.actionDeadline && (
          <p style={{ marginTop: 'var(--space-3)' }}>
            <span className="deadline">
              <Icon name="flag" /> Action deadline: {formatDateTime(notice.actionDeadline)} (KST)
            </span>
          </p>
        )}
      </header>

      {notice.event && (
        <div style={{ padding: 'var(--space-4) var(--space-5) 0' }}>
          <EventStatusBanner event={notice.event} />
        </div>
      )}

      <div className="body">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {notice.attachments && notice.attachments.length > 0 && (
        <section style={{ padding: '0 var(--space-5) var(--space-5)' }} aria-labelledby="attachments-title">
          <h2 id="attachments-title" style={{ fontSize: 'var(--text-lg)' }}>
            Attachments
          </h2>
          <ul className="attachment-list">
            {notice.attachments.map((a) => (
              <li key={a.fileId}>
                <Icon name="file" />
                <span style={{ flex: 1 }}>
                  {a.fileName} <span className="muted small">({formatBytes(a.size)})</span>
                </span>
                <a href={a.downloadUrl} download>
                  <Icon name="download" size={16} /> Download
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="facts">
        <dt>Publishing office</dt>
        <dd>{notice.publishingOffice || '-'}</dd>
        {notice.contactEmail && (
          <>
            <dt>Contact</dt>
            <dd>
              <a href={`mailto:${notice.contactEmail}`}>{notice.contactEmail}</a>
            </dd>
          </>
        )}
        <dt>{preview ? 'Requested publication' : 'Published'}</dt>
        <dd>{notice.publishedAt ? `${formatDateTime(notice.publishedAt)} (KST)` : 'Not set'}</dd>
        {notice.updatedAt && (
          <>
            <dt>Updated</dt>
            <dd>{formatDate(notice.updatedAt)}</dd>
          </>
        )}
        {notice.publicationEnd && (
          <>
            <dt>{preview ? 'Requested end' : 'Visible until'}</dt>
            <dd>{formatDateTime(notice.publicationEnd)} (KST)</dd>
          </>
        )}
        <dt>Priority</dt>
        <dd>{humanize(notice.priority || 'NORMAL')}</dd>
      </dl>
    </article>
  );
}
