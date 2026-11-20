import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Icon from '../../components/ui/Icon';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { DataState } from '../../components/ui/States';
import { TypeTag, ItemStatusBadge } from '../../components/lostFound/LfBadges';
import PhotoManager from '../../components/lostFound/PhotoManager';
import DeleteButton from '../../components/lostFound/DeleteButton';
import { BackToLostFound } from './LostFoundItem';
import useApi from '../../hooks/useApi';
import { getMyItem, deleteMyItem, resolveMyItem } from '../../api/lostFound';
import { lfLabel, postedDate } from '../../lib/lostFoundLabels';

export default function MyReport() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState(location.state && location.state.flash);
  const [resolving, setResolving] = useState(false);
  const result = useApi(() => getMyItem(id), [id]);

  return (
    <DataState {...result} onRetry={result.reload}>
      {(item) => {
        const listed = ['OPEN', 'COLLECTION_APPROVED'].includes(item.status);
        return (
          <>
            <PageHeader
              title={item.title}
              breadcrumb={
                <span className="row" style={{ gap: 'var(--space-4)' }}>
                  <BackToLostFound />
                  <Link to="/lost-found/my-cases">My Cases</Link>
                </span>
              }
              actions={
                <>
                  {listed && (
                    <Button variant="secondary" icon="edit" to={`/lost-found/my-reports/${item.id}/edit`}>
                      Edit
                    </Button>
                  )}
                  {item.type === 'LOST' && item.status === 'OPEN' && (
                    <Button icon="check" onClick={() => setResolving(true)}>
                      Mark as found
                    </Button>
                  )}
                  <DeleteButton
                    size="md"
                    what="report"
                    name={item.title}
                    onDelete={() => deleteMyItem(item.id).then(() => navigate('/lost-found/my-cases'))}
                  />
                </>
              }
            />
            <div className="stack">
              {flash && <Alert type="success">{flash}</Alert>}
              <div className="row">
                <TypeTag type={item.type} />
                {item.status !== 'OPEN' && <ItemStatusBadge status={item.status} />}
                {listed && (
                  <Link to={`/lost-found/items/${item.id}`} className="small">
                    View public page
                  </Link>
                )}
              </div>
              {item.type === 'FOUND' && typeof item.claimCount === 'number' && listed && (
                <Alert type="info">
                  {item.claimCount === 0 ? 'No one has claimed this item yet.' : `${item.claimCount} claim(s) are with the admin.`}
                </Alert>
              )}

              <section className="panel">
                <div className="panel-title">
                  <h2>Report details</h2>
                </div>
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
                {item.type === 'LOST' && item.privateDetails && (
                  <div className="lf-private" style={{ marginTop: 'var(--space-4)' }}>
                    <h3>
                      <Icon name="shield" size={18} /> Private details (only you and the admin)
                    </h3>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.privateDetails}</p>
                  </div>
                )}
                <div className="panel-title" style={{ marginTop: 'var(--space-5)' }}>
                  <h2>Photos</h2>
                </div>
                <PhotoManager item={item} onChange={(updated) => result.setData(updated)} />
              </section>
            </div>
            <ConfirmDialog
              open={resolving}
              title="Mark this item as found?"
              message="Great news! The report will be removed from the public list."
              confirmLabel="Mark as found"
              variant="primary"
              onConfirm={async () => {
                const updated = await resolveMyItem(item.id);
                result.setData(updated);
                setFlash('Marked as found. The report is no longer listed.');
              }}
              onClose={() => setResolving(false)}
            />
          </>
        );
      }}
    </DataState>
  );
}
