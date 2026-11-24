import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Checkbox from '../../components/ui/Checkbox';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { DataState } from '../../components/ui/States';
import { TypeTag, ItemStatusBadge, ClaimStatusBadge } from '../../components/lostFound/LfBadges';
import PhotoGallery from '../../components/lostFound/PhotoGallery';
import CaseHistory from '../../components/lostFound/CaseHistory';
import DeleteButton from '../../components/lostFound/DeleteButton';
import PrivateEvidence from '../../components/lostFound/PrivateEvidence';
import { BackToDashboard } from './AdminLfItems';
import useApi from '../../hooks/useApi';
import {
  adminGetItem,
  adminDeleteItem,
  adminDecide,
  adminRelease,
  adminHandover,
  adminDeleteClaim,
  privatePhotoUrl,
} from '../../api/lostFound';
import { lfLabel, postedDate } from '../../lib/lostFoundLabels';

function HandoverDialog({ claim, onClose, onDone }) {
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState(claim && claim.claimant ? claim.claimant.name : '');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!checked) return setError("Confirm that you checked the collector's student card.");
    if (name.trim().length < 2) return setError('Enter the name of the person collecting.');
    setBusy(true);
    setError(null);
    try {
      await adminHandover(claim.id, { identityChecked: true, recipientName: name.trim(), note: note.trim() || undefined });
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
    return undefined;
  }

  return (
    <Modal
      open={Boolean(claim)}
      title="Record handover"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} busy={busy} icon="check">
            Record handover
          </Button>
        </>
      }
    >
      <div className="stack">
        <Alert type="warning">Only record this when the student has physically collected the item. It cannot be undone.</Alert>
        <Input label="Collected by" required value={name} onChange={(e) => setName(e.target.value)} />
        <Checkbox
          label="I checked the collector's student card and it matches the approved claimant."
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          hint="Do not record card numbers."
        />
        <Textarea label="Note (optional)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <Alert type="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function ClaimCard({ claim, item, onAction, onDeleted }) {
  const isActive = item.activeClaimId === claim.id;
  const slotTaken = Boolean(item.activeClaimId) && !isActive;
  return (
    <article id={`claim-${claim.id}`} className={`lf-claim ${isActive ? 'active' : ''}`}>
      <div className="row-between">
        <div className="row">
          <ClaimStatusBadge status={claim.status} />
          <strong>{claim.claimant ? claim.claimant.name : 'Student'}</strong>
          {claim.claimant && <span className="small muted">{claim.claimant.email}</span>}
        </div>
        <span className="small muted">Claimed {postedDate(claim.createdAt)}</span>
      </div>
      <div>
        <div className="small muted" style={{ fontWeight: 700 }}>
          Proof of ownership (private)
        </div>
        {claim.evidenceRedacted ? (
          <p className="muted">Removed under the retention rule.</p>
        ) : (
          <div className="lf-evidence">{claim.evidenceText}</div>
        )}
      </div>
      {!claim.evidenceRedacted && !item.deleted && <PrivateEvidence claimId={claim.id} canDelete />}
      {claim.decisionNote && (
        <p className="small" style={{ margin: 0 }}>
          <strong>Note:</strong> {claim.decisionNote}
        </p>
      )}
      {claim.handover && (
        <Alert type="success" title="Collected">
          {postedDate(claim.handover.at)} by {claim.handover.recipientName}; student card checked by{' '}
          {claim.handover.admin ? claim.handover.admin.name : 'admin'}.{claim.handover.note && <div>{claim.handover.note}</div>}
        </Alert>
      )}
      <div className="row">
        {claim.status === 'PENDING' && (
          <>
            <Button size="sm" icon="check" disabled={slotTaken} onClick={() => onAction('approve', claim)}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" icon="close" onClick={() => onAction('reject', claim)}>
              Reject
            </Button>
          </>
        )}
        {claim.status === 'APPROVED' && !claim.handover && (
          <>
            <Button size="sm" icon="check" onClick={() => onAction('handover', claim)}>
              Record handover
            </Button>
            <Button size="sm" variant="secondary" icon="refresh" onClick={() => onAction('release', claim)}>
              Release approval
            </Button>
          </>
        )}
        <DeleteButton
          what="claim"
          name={`${claim.claimant ? claim.claimant.name : 'Student'}'s claim`}
          onDelete={() => adminDeleteClaim(claim.id).then(onDeleted)}
        />
        {claim.status === 'PENDING' && slotTaken && <span className="small muted">Another claim is approved. Release it first.</span>}
        {claim.status === 'APPROVED' && !claim.handover && (
          <span className="small muted">Approved is not returned yet: record the handover when the student collects it.</span>
        )}
      </div>
    </article>
  );
}

/** Admin view of one report: all details, private info, and every claim with actions. */
export default function AdminLfItem() {
  const { id } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const result = useApi(() => adminGetItem(id), [id]);
  const [action, setAction] = useState(null);
  const [flash, setFlash] = useState(null);
  const kind = action && action.kind;
  const close = () => setAction(null);
  const done = (message) => () => {
    setFlash(message);
    result.reload();
  };

  useEffect(() => {
    if (hash && result.data) {
      const el = document.getElementById(hash.slice(1));
      if (el) el.scrollIntoView();
    }
  }, [hash, result.data]);

  return (
    <DataState {...result} onRetry={result.reload}>
      {(item) => (
        <>
          <PageHeader
            title={item.title}
            breadcrumb={<BackToDashboard />}
            actions={
              <DeleteButton
                size="md"
                what="report"
                name={item.title}
                onDelete={() => adminDeleteItem(item.id).then(() => navigate('/admin/lost-found'))}
              />
            }
          />
          <div className="stack">
            {flash && <Alert type="success">{flash}</Alert>}
            <div className="row">
              <TypeTag type={item.type} />
              {item.status !== 'OPEN' && <ItemStatusBadge status={item.status} />}
              <span className="small muted">
                Reported by {item.reporter ? `${item.reporter.name} (${item.reporter.email})` : '-'} on {postedDate(item.postedAt)}
              </span>
            </div>

            <div className="grid grid-sidebar">
              <div className="stack">
                <section className="panel">
                  <div className="panel-title">
                    <h2>Report</h2>
                  </div>
                  {item.photoIds.length > 0 && (
                    <div style={{ maxWidth: 420, marginBottom: 'var(--space-4)' }}>
                      <PhotoGallery
                        photoIds={item.photoIds}
                        urlFor={(pid) => privatePhotoUrl(item.id, pid)}
                        category={item.category}
                        title={item.title}
                      />
                    </div>
                  )}
                  <dl className="lf-facts">
                    <dt>Reference</dt>
                    <dd className="mono">{item.reference}</dd>
                    <dt>Category</dt>
                    <dd>{lfLabel(item.category)}</dd>
                    <dt>Location</dt>
                    <dd>{item.location}</dd>
                    <dt>Posted</dt>
                    <dd>{postedDate(item.postedAt)}</dd>
                    {item.custodyNote && (
                      <>
                        <dt>Where it is now</dt>
                        <dd>{item.custodyNote}</dd>
                      </>
                    )}
                    <dt>Description</dt>
                    <dd>{item.description}</dd>
                    <dt>Contact</dt>
                    <dd>
                      {item.contactDetails || <span className="muted">Not given</span>}{' '}
                      <span className="tag">Visible to: {lfLabel(item.contactVisibility)}</span>
                    </dd>
                  </dl>
                  {item.privateDetails && (
                    <div className="lf-private" style={{ marginTop: 'var(--space-4)' }}>
                      <h3>
                        <Icon name="shield" size={18} /> Private details
                      </h3>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.privateDetails}</p>
                    </div>
                  )}
                </section>

                {item.type === 'FOUND' ? (
                  <section className="panel stack" id="claims" aria-label="Claims">
                    <div className="panel-title">
                      <h2>Claims ({item.claims.length})</h2>
                    </div>
                    {item.claims.length === 0 && <p className="muted">No claims yet.</p>}
                    {item.claims.map((c) => (
                      <ClaimCard
                        key={c.id}
                        claim={c}
                        item={item}
                        onAction={(k, claim) => setAction({ kind: k, claim })}
                        onDeleted={done('Claim deleted.')}
                      />
                    ))}
                  </section>
                ) : (
                  <Alert type="info">Lost items cannot be claimed. Finders hand the item in at the office quoting the reference.</Alert>
                )}
              </div>
              <CaseHistory history={item.history} />
            </div>
          </div>

          <ConfirmDialog
            open={kind === 'approve'}
            title="Approve this claim?"
            message="Only one claim can be approved per item. The student will see a notice. The item is not returned until you record the handover."
            confirmLabel="Approve"
            variant="primary"
            onConfirm={() => adminDecide(action.claim.id, { decision: 'APPROVE' }).then(done('Claim approved. It moved to Approved.'))}
            onClose={close}
          />
          <ConfirmDialog
            open={kind === 'reject'}
            title="Reject this claim?"
            message="The student will see a notice that the claim was rejected."
            confirmLabel="Reject"
            onConfirm={() => adminDecide(action.claim.id, { decision: 'REJECT' }).then(done('Claim rejected.'))}
            onClose={close}
          />
          <ConfirmDialog
            open={kind === 'release'}
            title="Release this approval?"
            message="The claim becomes Rejected and other students can claim the item again."
            confirmLabel="Release approval"
            requireReason
            onConfirm={(note) => adminRelease(action.claim.id, note).then(done('Approval released.'))}
            onClose={close}
          />
          <HandoverDialog
            key={action && action.claim ? action.claim.id : 'none'}
            claim={kind === 'handover' ? action.claim : null}
            onClose={close}
            onDone={done('Handover recorded. The item is now returned to its owner.')}
          />
          {item.status === 'RETURNED' && (
            <p className="small muted">
              This item was returned. <Link to="/admin/lost-found/items">Back to all items</Link>
            </p>
          )}
        </>
      )}
    </DataState>
  );
}
