import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Alert from '../../components/ui/Alert';
import { DataState } from '../../components/ui/States';
import { ClaimStatusBadge, TypeTag } from '../../components/lostFound/LfBadges';
import DeleteButton from '../../components/lostFound/DeleteButton';
import { BackToLostFound } from './LostFoundItem';
import useApi from '../../hooks/useApi';
import { getMyClaim, deleteMyClaim } from '../../api/lostFound';
import { lfLabel, postedDate } from '../../lib/lostFoundLabels';
import PrivateEvidence from '../../components/lostFound/PrivateEvidence';

const MESSAGE = {
  PENDING: 'The admin will review your claim. You will see a notice when it is decided.',
  APPROVED: 'Approved! Bring your student card to collect the item.',
  REJECTED: 'This claim was not accepted.',
};

/** Claim detail for the claimant only. Other members get 404 from the server. */
export default function MyClaim() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const flash = location.state && location.state.flash;
  const result = useApi(() => getMyClaim(id), [id]);

  return (
    <DataState {...result} onRetry={result.reload}>
      {(claim) => (
        <>
          <PageHeader
            title={`Claim: ${claim.item ? claim.item.title : 'item'}`}
            breadcrumb={
              <span className="row" style={{ gap: 'var(--space-4)' }}>
                <BackToLostFound />
                <Link to="/items/my-cases?tab=claims">My Claims</Link>
              </span>
            }
            actions={
              <DeleteButton
                size="md"
                what="claim"
                name={claim.item ? claim.item.title : 'this claim'}
                onDelete={() => deleteMyClaim(claim.id).then(() => navigate('/items/my-cases?tab=claims'))}
              />
            }
          />
          <div className="stack">
            {flash && <Alert type="success">{flash}</Alert>}
            <div className="row">
              <span className="small muted">Admin decision:</span> <ClaimStatusBadge status={claim.status} />
            </div>
            <Alert type={claim.status === 'REJECTED' ? 'error' : claim.status === 'APPROVED' ? 'success' : 'info'}>
              {claim.collected ? `You collected this item on ${postedDate(claim.collectedAt)}.` : MESSAGE[claim.status]}
              {claim.status === 'APPROVED' && !claim.collected && claim.item && claim.item.custodyNote && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <strong>Where to collect:</strong> {claim.item.custodyNote}
                </div>
              )}
              {claim.decisionNote && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <strong>Note from the admin:</strong> {claim.decisionNote}
                </div>
              )}
            </Alert>

            <div className="grid grid-2">
              {claim.item && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Item</h2>
                  </div>
                  <dl className="lf-facts">
                    <dt>Item</dt>
                    <dd>
                      <TypeTag type={claim.item.type} /> {claim.item.title}
                    </dd>
                    <dt>Reference</dt>
                    <dd className="mono">{claim.item.reference}</dd>
                    <dt>Category</dt>
                    <dd>{lfLabel(claim.item.category)}</dd>
                    <dt>Found at</dt>
                    <dd>{claim.item.location}</dd>
                    <dt>Posted</dt>
                    <dd>{postedDate(claim.item.postedAt)}</dd>
                  </dl>
                  {!claim.item.deleted && ['OPEN', 'COLLECTION_APPROVED'].includes(claim.item.status) && (
                    <p className="small" style={{ marginBottom: 0 }}>
                      <Link to={`/items/${claim.item.id}`}>View item page</Link>
                    </p>
                  )}
                </section>
              )}
              <section className="panel">
                <div className="panel-title">
                  <h2>Your proof (private)</h2>
                </div>
                {claim.evidenceRedacted ? (
                  <p className="muted">Removed under the retention rule after the case finished.</p>
                ) : (
                  <div className="lf-evidence">{claim.evidenceText}</div>
                )}
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Claimed {postedDate(claim.createdAt)}
                </p>
              </section>
            </div>
            {!claim.evidenceRedacted && !claim.item?.deleted && <PrivateEvidence claimId={claim.id}
              canUpload={claim.status === 'PENDING' && ['OPEN', 'COLLECTION_APPROVED'].includes(claim.item?.status)}
              canDelete={claim.status === 'PENDING'} />}
          </div>
        </>
      )}
    </DataState>
  );
}
