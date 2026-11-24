import { Link, useLocation, useParams } from 'react-router-dom';
import NoticeView from '../components/notices/NoticeView';
import { LoadingState, ErrorState } from '../components/ui/States';
import useApi from '../hooks/useApi';
import useDepartments from '../hooks/useDepartments';
import { getPublicNotice } from '../api/notices';
import NotFound from './NotFound';
import { useEffect } from 'react';
import BookmarkControl from '../member4/items/BookmarkControl';

export default function NoticeDetails() {
  const { id } = useParams();
  const { state } = useLocation();
  const returnTo = typeof state?.returnTo === 'string' && /^\/(?:search|notifications)(?:\?[^#]*)?$/.test(state.returnTo) ? state.returnTo : null;
  const { byCode } = useDepartments();
  const { data, error, loading, reload } = useApi(() => getPublicNotice(id), [id]);

  useEffect(() => {
    if (data) document.title = `${data.title} - KDU Global UIDS`;
  }, [data]);

  if (loading && !data) return <LoadingState />;
  if (error && (error.status === 404 || error.status === 400)) return <NotFound />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="stack">
      <div className="breadcrumb">
        <Link to="/notices">Notices</Link> / {data.title}
      </div>
      <NoticeView notice={data} departments={byCode} />
      <BookmarkControl noticeId={data.id} />
      {returnTo && <Link to={returnTo} state={{ focusReturn: true }}>{returnTo.startsWith('/notifications') ? 'Back to notifications' : 'Back to search'}</Link>}
    </div>
  );
}
