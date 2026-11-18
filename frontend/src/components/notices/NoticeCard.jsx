import { Link } from 'react-router-dom';
import PriorityBadge from '../ui/PriorityBadge';
import Icon from '../ui/Icon';
import { formatDate, formatDateTime } from '../../lib/time';
import { humanize } from '../../lib/labels';
import BookmarkControl from '../../member4/items/BookmarkControl';

export default function NoticeCard({ notice, departments = {} }) {
  return (
    <article className={`card notice-card ${notice.pinned ? 'pinned' : ''}`}>
      <div className="notice-card-top"><span className="notice-type-icon"><Icon name={notice.category === 'EVENT' ? 'calendar' : notice.category === 'SCHOLARSHIP' ? 'flag' : 'file'} size={20} /></span><div className="notice-card-labels">
        <PriorityBadge priority={notice.priority} pinned={notice.pinned} />
        <span className="tag">{humanize(notice.category)}</span>
        <span className="tag">{notice.department === 'ALL' ? 'All departments' : departments[notice.department] || notice.department}</span>
        {/^\[(?:demo|sample)\]/i.test(notice.title) && <span className="sample-badge">Sample content</span>}
      </div></div>
      <h3>
        <Link to={`/notices/${notice.id}`}>{notice.title}</Link>
      </h3>
      <p className="notice-card-summary">{notice.summary}</p>
      <div className="card-meta">
        <span>
          <Icon name="calendar" size={14} /> Published {formatDate(notice.publishedAt)}
        </span>
        {notice.updatedAt && (
          <span>
            <Icon name="refresh" size={14} /> Updated {formatDate(notice.updatedAt)}
          </span>
        )}
        {notice.actionDeadline && (
          <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>
            <Icon name="flag" size={14} /> Action deadline {formatDateTime(notice.actionDeadline)}
          </span>
        )}
        {notice.visibility === 'CAMPUS' && <span>Campus only</span>}
      </div>
      <BookmarkControl noticeId={notice.id} />
    </article>
  );
}
