import { Link } from 'react-router-dom';
import PriorityBadge from '../ui/PriorityBadge';
import Icon from '../ui/Icon';
import BookmarkControl from '../../member4/items/BookmarkControl';
import { formatDate, formatDateTime } from '../../lib/time';
import { humanize } from '../../lib/labels';

/** Bulletin presentation; Home and search keep their existing compact cards. */
export default function NoticeBoardCard({ notice, departments, returnTo, featured = false }) {
  const department = notice.department === 'ALL' ? 'All departments' : departments[notice.department] || notice.department;
  const destination = `/notices/${notice.id}`;
  const navigation = { returnTo };
  return (
    <article className={`notice-board-card${featured ? ' is-featured' : ''}${notice.pinned ? ' is-pinned' : ''}`}>
      <div className="notice-board-card-heading">
        <div className="notice-board-category">
          <span className="notice-board-icon"><Icon name={notice.category === 'EVENT' ? 'calendar' : notice.category === 'SCHOLARSHIP' ? 'flag' : 'file'} size={21} /></span>
          <div><span className="notice-board-category-name">{humanize(notice.category)}</span><span className="notice-board-department">{department}</span></div>
        </div>
        <div className="notice-board-priority"><PriorityBadge priority={notice.priority} pinned={notice.pinned} /></div>
      </div>
      <div className="notice-board-copy">
        <h3><Link to={destination} state={navigation}>{notice.title}</Link></h3>
        <p>{notice.summary}</p>
      </div>
      <div className="notice-board-dates">
        <span><Icon name="calendar" size={14} /><span>Published <time dateTime={notice.publishedAt}>{formatDate(notice.publishedAt)}</time></span></span>
        {notice.updatedAt && <span><Icon name="refresh" size={14} /><span>Updated <time dateTime={notice.updatedAt}>{formatDate(notice.updatedAt)}</time></span></span>}
        {notice.visibility === 'CAMPUS' && <span><Icon name="shield" size={14} />Campus only</span>}
        {notice.actionDeadline && <div className="notice-board-deadline"><Icon name="clock" size={16} /><span><strong>Action deadline</strong><time dateTime={notice.actionDeadline}>{formatDateTime(notice.actionDeadline)} <span>KST</span></time></span></div>}
        {/^\[(?:demo|sample)\]/i.test(notice.title) && <span className="sample-badge notice-board-sample">Sample content</span>}
      </div>
      <div className="notice-board-actions">
        <Link className="notice-board-read" to={destination} state={navigation} aria-label={`Read notice: ${notice.title}`}>Read notice<Icon name="arrowRight" size={16} /></Link>
        <div className="notice-board-bookmark"><BookmarkControl noticeId={notice.id} /></div>
      </div>
    </article>
  );
}
