import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { DataState } from '../../components/ui/States.jsx';
import useDepartments from '../../hooks/useDepartments.js';
import { CATEGORIES, humanize } from '../../lib/labels.js';
import MemberPage from '../components/MemberPage.jsx';
import useMemberQuery from '../data/useMemberQuery.js';
import { addFollow, removeFollow, removeBookmark } from '../data/memberApi.js';
import NotificationPreferences from '../notifications/NotificationPreferences.jsx';

export default function SavedInterests() {
  return <MemberPage title="Saved interests" description="Save public notices and follow notice categories or departments with your UIDS account."><SavedContent /></MemberPage>;
}
function SavedContent() {
  const [page, setPage] = useState(1);
  const bookmarks = useMemberQuery(`/member-tools/bookmarks?page=${page}&limit=12`);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  async function remove(id) {
    setPending(id); setError('');
    try { await removeBookmark(id); setPage(1); bookmarks.reload(); }
    catch (failure) { setError(failure.message); }
    finally { setPending(''); }
  }
  return <div className="stack">
    <section aria-labelledby="bookmarks-title"><div className="row-between"><h2 id="bookmarks-title">Saved notices</h2><Button variant="secondary" size="sm" onClick={bookmarks.reload}>Refresh saved notices</Button></div>
      {error && <Alert type="error">{error}</Alert>}
      <DataState {...bookmarks} onRetry={bookmarks.reload} isEmpty={(data) => !data.data.length} emptyTitle="No saved notices" emptyText="Use Save notice on a published notice to keep it here.">{(data) => <><div className="grid grid-3">{data.data.map((bookmark) => <article className="card stack" key={bookmark.id}><h3>{bookmark.available ? <Link to={bookmark.notice.href}>{bookmark.notice.title}</Link> : 'Notice no longer available'}</h3>{bookmark.available ? <p>{bookmark.notice.summary}</p> : <p>This notice is no longer visible to your account.</p>}<Button variant="secondary" size="sm" busy={pending === bookmark.noticeId} onClick={() => remove(bookmark.noticeId)}>Remove bookmark</Button></article>)}</div><Pagination meta={data.meta} onPage={setPage} /></>}</DataState>
    </section>
    <Follows />
    <NotificationPreferences />
    <Link to="/notifications">Open your notification inbox</Link>
  </div>;
}
function Follows() {
  const follows = useMemberQuery('/member-tools/follows');
  const { departments, byCode } = useDepartments();
  const [kind, setKind] = useState('category');
  const [target, setTarget] = useState('GENERAL');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const options = kind === 'category' ? CATEGORIES.map((category) => ({ value: category, label: humanize(category) })) : [{ value: 'ALL', label: 'University-wide notices' }, ...departments.map((department) => ({ value: department.code, label: department.name }))];
  async function change(action) {
    setPending(true); setError('');
    try { await action(); follows.reload(); }
    catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  return <section className="panel stack" aria-labelledby="follows-title"><h2 id="follows-title">Follow notice topics</h2><p>New matching publications, corrections and event schedule updates appear in your inbox. Following starts now and does not replay earlier publications.</p>
    <form className="stack" onSubmit={(event) => { event.preventDefault(); change(() => addFollow(kind, target)); }}><div className="grid grid-2"><Select label="Topic type" value={kind} options={[{ value: 'category', label: 'Notice category' }, { value: 'department', label: 'Department' }]} onChange={(event) => { setKind(event.target.value); setTarget(event.target.value === 'category' ? 'GENERAL' : 'ALL'); }} /><Select label="Topic" value={target} options={options} onChange={(event) => setTarget(event.target.value)} /></div><Button type="submit" busy={pending}>Follow topic</Button></form>
    {error && <Alert type="error">{error}</Alert>}
    <DataState {...follows} onRetry={follows.reload} isEmpty={(data) => !data.data.length} emptyTitle="No topics followed" emptyText="Choose a topic to receive future matching updates.">{(data) => <ul className="stack">{data.data.map((follow) => <li key={follow.id} className="row-between"><span>{follow.kind === 'category' ? humanize(follow.target) : follow.target === 'ALL' ? 'University-wide notices' : byCode[follow.target] || follow.target}</span><Button variant="secondary" size="sm" disabled={pending} onClick={() => change(() => removeFollow(follow.id))}>Unfollow</Button></li>)}</ul>}</DataState>
  </section>;
}
