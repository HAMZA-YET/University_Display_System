import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import NoticeForm from '../../components/notices/NoticeForm';
import ReviewHistory from '../../components/notices/ReviewHistory';
import EventForm from '../../components/events/EventForm';
import StatusBadge from '../../components/ui/StatusBadge';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { LoadingState, ErrorState } from '../../components/ui/States';
import useDepartments from '../../hooks/useDepartments';
import { getNotice, createNotice, updateNotice, submitNotice } from '../../api/notices';
import { noticeToForm, formToNoticeBody } from '../../lib/noticeMapping';
import { formatTime } from '../../lib/time';
import { humanize } from '../../lib/labels';

const COMPARE_FIELDS = ['title', 'summary', 'body', 'category', 'department', 'audience', 'visibility', 'publishingOffice', 'contactEmail', 'actionDeadline', 'requestedPublicationStart', 'requestedPublicationEnd'];

function changesAsText(values) {
  return COMPARE_FIELDS.map((f) => `${humanize(f)}:\n${values[f] || ''}`).join('\n\n');
}

/**
 * Notice editor. A save shows "Saved" only after the server confirms it.
 * On 409 VERSION_CONFLICT the typed text is kept, a banner explains the
 * conflict, and the author can load the latest version (side-by-side
 * comparison) or copy their changes. Nothing is ever resent automatically.
 */
export default function NoticeEditor() {
  const { id } = useParams();
  return <NoticeEditorContent key={id || 'new'} id={id} />;
}

function NoticeEditorContent({ id }) {
  const navigate = useNavigate();
  const isNew = !id;
  const formRef = useRef(null);
  const { departments } = useDepartments();
  const [notice, setNotice] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [attachments, setAttachments] = useState([]);
  const [event, setEvent] = useState(null);
  const [status, setStatus] = useState('');
  const [conflict, setConflict] = useState(null);
  const [latest, setLatest] = useState(null);
  const [myValues, setMyValues] = useState(null);
  const [copied, setCopied] = useState(null);
  const [formKey, setFormKey] = useState(0);

  async function load() {
    try {
      const n = await getNotice(id);
      setNotice(n);
      setAttachments(n.attachments || []);
      setEvent(n.event || null);
      setFormKey((k) => k + 1);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isNew) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save(values) {
    const body = formToNoticeBody(values, attachments);
    if (isNew && !notice) {
      const created = await createNotice(body);
      setNotice(created);
      setStatus(`Saved at ${formatTime(new Date())}. Version ${created.version}.`);
      navigate(`/author/notices/${created.id}/edit`, { replace: true });
      return created;
    }
    try {
      const updated = await updateNotice(notice.id, body, notice.version);
      setNotice(updated);
      setConflict(null);
      setStatus(`Saved at ${formatTime(new Date())}. Version ${updated.version}.`);
      return updated;
    } catch (err) {
      if (err.code === 'VERSION_CONFLICT') {
        setStatus('');
        setConflict({ message: err.message, currentVersion: err.currentVersion });
        return null;
      }
      throw err;
    }
  }

  async function saveAndSubmit(values) {
    const saved = await save(values);
    if (!saved) return;
    await submitNotice(saved.id, saved.version);
    navigate('/author/notices', { state: { flash: `"${saved.title}" was submitted for review.` } });
  }

  async function loadLatest() {
    try {
      const n = await getNotice(notice.id);
      setMyValues(formRef.current.getValues());
      setLatest(n);
    } catch (error) {
      setConflict((current) => ({ ...current, message: error.message }));
    }
  }

  async function copyMine() {
    const text = changesAsText(formRef.current.getValues());
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ ok: true, text });
    } catch {
      setCopied({ ok: false, text });
    }
  }

  function useLatest() {
    setNotice(latest);
    setAttachments(latest.attachments || []);
    setEvent(latest.event || null);
    setConflict(null);
    setLatest(null);
    setFormKey((k) => k + 1);
    setStatus(`Loaded the latest version (${latest.version}). Your unsaved changes were discarded.`);
  }

  function keepMine() {
    setNotice((n) => ({ ...n, version: latest.version }));
    setConflict(null);
    setLatest(null);
    setStatus(`Kept your text. Your next save will replace version ${latest.version}.`);
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState error={loadError} onRetry={() => {
    setLoading(true);
    setLoadError(null);
    load();
  }} />;

  const editable = isNew || (notice && ['DRAFT', 'RETURNED'].includes(notice.status));
  const latestValues = latest ? noticeToForm(latest) : null;

  return (
    <>
      <PageHeader
        title={isNew ? 'New notice' : 'Edit notice'}
        breadcrumb={<Link to="/author/notices">My notices</Link>}
        actions={notice && <StatusBadge status={notice.effectiveStatus} />}
      />
      <div aria-live="polite" role="status" className="visually-hidden">
        {status}
      </div>
      {status && (
        <Alert type="success">
          <span>{status}</span>
        </Alert>
      )}

      {conflict && (
        <div style={{ margin: 'var(--space-4) 0' }}>
          <Alert
            type="warning"
            title="Your changes were not saved"
            role="alert"
            actions={
              <>
                <Button variant="secondary" icon="refresh" onClick={loadLatest}>
                  Load latest version
                </Button>
                <Button variant="secondary" icon="copy" onClick={copyMine}>
                  Copy my changes
                </Button>
              </>
            }
          >
            <p style={{ margin: 0 }}>{conflict.message}</p>
            <p className="small" style={{ margin: 0 }}>
              Your typed text is still in the form below. The latest saved version is {conflict.currentVersion}.
            </p>
          </Alert>
        </div>
      )}
      {copied && (
        <Alert type={copied.ok ? 'success' : 'info'} title={copied.ok ? 'Your changes were copied to the clipboard.' : 'Copy your changes from the box below.'}>
          {!copied.ok && <textarea readOnly value={copied.text} rows={8} aria-label="Your changes" />}
        </Alert>
      )}

      {!editable ? (
        <Alert type="info" title={`This notice is ${humanize(notice.effectiveStatus)} and cannot be edited here.`}>
          {['SCHEDULED', 'PUBLISHED', 'EXPIRED'].includes(notice.effectiveStatus) ? (
            <Link to={`/author/notices/${notice.id}/revise`}>Create a correction instead</Link>
          ) : (
            <Link to="/author/notices">Back to my notices</Link>
          )}
        </Alert>
      ) : (
        <div className="grid grid-sidebar" style={{ marginTop: 'var(--space-4)' }}>
          <NoticeForm
            key={formKey}
            ref={formRef}
            defaultValues={noticeToForm(notice)}
            departments={departments}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onSaveDraft={save}
            onSubmitForReview={saveAndSubmit}
            version={notice ? notice.version : undefined}
            extraActions={
              notice && (
                <Button variant="ghost" icon="eye" to={`/author/notices/${notice.id}/preview`}>
                  Preview
                </Button>
              )
            }
            eventSection={<EventForm noticeId={notice ? notice.id : null} event={event} onChange={setEvent} />}
          />
          <aside className="stack">
            <section className="panel">
              <div className="panel-title">
                <h2>Review feedback</h2>
              </div>
              <ReviewHistory history={notice ? notice.reviewHistory : []} />
            </section>
            <section className="panel small">
              <div className="panel-title">
                <h2>How publishing works</h2>
              </div>
              <ol style={{ paddingLeft: 'var(--space-5)', margin: 0 }}>
                <li>Save a draft (only the title is needed).</li>
                <li>Preview it exactly as readers will see it.</li>
                <li>Submit for review. A reviewer approves, returns or rejects it.</li>
                <li>Once approved, changes are made as corrections.</li>
              </ol>
            </section>
          </aside>
        </div>
      )}

      <Modal
        open={Boolean(latest)}
        wide
        title={latest ? `Compare: your text and version ${latest.version}` : ''}
        onClose={() => setLatest(null)}
        footer={
          <>
            <Button variant="secondary" onClick={keepMine}>
              Keep my text
            </Button>
            <Button onClick={useLatest}>Use the latest version</Button>
          </>
        }
      >
        {latest && myValues && (
          <div className="table-wrap stack-mobile">
            <table className="table diff-table">
              <caption className="visually-hidden">Side-by-side comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Your unsaved text</th>
                  <th scope="col">Latest saved version ({latest.version})</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_FIELDS.map((f) => {
                  const changed = (myValues[f] || '') !== (latestValues[f] || '');
                  return (
                    <tr key={f}>
                      <td data-label="Field">
                        <strong>{humanize(f)}</strong>
                        {changed && <div className="small">DIFFERENT</div>}
                      </td>
                      <td data-label="Yours" className={changed ? 'changed' : ''}>
                        {myValues[f] || <span className="muted">(empty)</span>}
                      </td>
                      <td data-label="Latest" className={changed ? 'changed' : ''}>
                        {latestValues[f] || <span className="muted">(empty)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </>
  );
}
