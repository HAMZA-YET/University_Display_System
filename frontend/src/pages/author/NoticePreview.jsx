import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import NoticeView from '../../components/notices/NoticeView';
import ReviewHistory from '../../components/notices/ReviewHistory';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import StatusBadge from '../../components/ui/StatusBadge';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import useDepartments from '../../hooks/useDepartments';
import { previewNotice, getNotice, submitNotice } from '../../api/notices';

/**
 * Preview renders the working copy with the SAME NoticeView used by the public
 * detail page. Opening it changes nothing in the database.
 */
export default function NoticePreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { byCode } = useDepartments();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const result = useApi(async () => {
    const [view, meta] = await Promise.all([previewNotice(id), getNotice(id)]);
    return { view, meta };
  }, [id]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await submitNotice(id);
      navigate('/author/notices', { state: { flash: 'The notice was submitted for review.' } });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <DataState {...result} onRetry={result.reload}>
      {({ view, meta }) => {
        const editable = ['DRAFT', 'RETURNED'].includes(meta.status);
        return (
          <div className="stack">
            <div className="breadcrumb">
              <Link to="/author/notices">My notices</Link> / Preview
            </div>
            <div className="banner-preview" role="note">
              PREVIEW - NOT PUBLISHED
            </div>
            <div className="row-between">
              <div className="row">
                Current status: <StatusBadge status={meta.effectiveStatus} />
                <span className="small muted">Version {meta.version}</span>
              </div>
              {editable && (
                <div className="row">
                  <Button variant="secondary" icon="edit" to={`/author/notices/${id}/edit`}>
                    Back to edit
                  </Button>
                  <Button icon="upload" onClick={submit} busy={busy}>
                    Submit for review
                  </Button>
                </div>
              )}
            </div>
            {error && (
              <Alert type="error" title={error.message}>
                {error.details && error.details.length > 0 && (
                  <ul>
                    {error.details.map((d, i) => (
                      <li key={i}>{d.message}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}
            <NoticeView notice={view} departments={byCode} preview />
            <section className="panel">
              <div className="panel-title">
                <h2>Review feedback</h2>
              </div>
              <ReviewHistory history={meta.reviewHistory} />
            </section>
          </div>
        );
      }}
    </DataState>
  );
}
