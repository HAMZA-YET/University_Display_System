import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Textarea from '../../components/ui/Textarea';
import Alert from '../../components/ui/Alert';
import Icon from '../../components/ui/Icon';
import { DataState } from '../../components/ui/States';
import { TypeTag, ItemStatusBadge } from '../../components/lostFound/LfBadges';
import PhotoGallery from '../../components/lostFound/PhotoGallery';
import useApi from '../../hooks/useApi';
import useAuth from '../../hooks/useAuth';
import { getPublicItem, getMyItem, submitClaim, publicPhotoUrl } from '../../api/lostFound';
import { lfLabel, postedDate } from '../../lib/lostFoundLabels';

export function BackToLostFound() {
  return (
    <Link to="/lost-found">
      <Icon name="chevronLeft" size={14} /> Back to Lost &amp; Found
    </Link>
  );
}

function ClaimForm({ item }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const tooShort = text.trim().length < 20;

  async function submit(e) {
    e.preventDefault();
    if (tooShort) {
      setError({ message: 'Describe something only the owner would know (at least 20 characters).' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const claim = await submitClaim(item.id, text.trim());
      navigate(`/lost-found/my-claims/${claim.id}`, {
        state: { flash: 'Your claim was sent privately to the admin. You will see the decision here.' },
      });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel stack" noValidate>
      <div className="panel-title">
        <h2>Is this yours?</h2>
      </div>
      <p className="small">
        Only the admin will read this. Give details that prove the item is yours, such as marks, contents or exactly where you left it.
      </p>
      {error && (
        <Alert type="error">
          {error.message}
          {error.code === 'DUPLICATE_CLAIM' && (
            <>
              {' '}
              <Link to="/lost-found/my-cases?tab=claims">See my claims</Link>
            </>
          )}
        </Alert>
      )}
      <Textarea
        label="Proof of ownership"
        required
        rows={5}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        hint={`At least 20 characters. ${text.trim().length}/2000.`}
        error={error && tooShort ? error.message : undefined}
      />
      <div className="form-actions">
        <Button type="submit" icon="shield" busy={busy}>
          Claim
        </Button>
      </div>
    </form>
  );
}

/**
 * Is the signed-in member the reporter of this item? The public item never
 * names its reporter, so we ask the member's own reports instead (404 = not yours).
 */
function useIsMine(id, user) {
  const [mine, setMine] = useState(null);
  useEffect(() => {
    let active = true;
    if (!user) {
      setMine(false);
      return undefined;
    }
    setMine(null);
    getMyItem(id)
      .then(() => active && setMine(true))
      .catch(() => active && setMine(false));
    return () => {
      active = false;
    };
  }, [id, user]);
  return mine;
}
export default function LostFoundItem() {
  const { id } = useParams();
  const { user, hasRole } = useAuth();
  const result = useApi(() => getPublicItem(id), [id]);

    const mine = useIsMine(id, user);

  return (
    <DataState {...result} onRetry={result.reload}>
      {(item) => (
        <>
          <PageHeader title={item.title} breadcrumb={<BackToLostFound />} />
          <div className="grid grid-sidebar">
            <article className="notice-view">
              <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
                <PhotoGallery
                  photoIds={item.photoIds}
                  urlFor={(pid) => publicPhotoUrl(item.id, pid)}
                  category={item.category}
                  title={item.title}
                />
              </div>
              <header>
                <div className="row">
                  <TypeTag type={item.type} />
                  <span className="tag">{lfLabel(item.category)}</span>
                  {item.status !== 'OPEN' && <ItemStatusBadge status={item.status} />}
                </div>
              </header>
              <div className="body">{item.description}</div>
              <dl className="facts">
                <dt>Reference</dt>
                <dd className="mono">{item.reference}</dd>
                <dt>{item.type === 'FOUND' ? 'Found at' : 'Lost near'}</dt>
                <dd>{item.location}</dd>
                <dt>Posted</dt>
                <dd>{postedDate(item.postedAt)}</dd>
                {item.custodyNote && (
                  <>
                    <dt>Where it is now</dt>
                    <dd>{item.custodyNote}</dd>
                  </>
                )}
                {item.contactDetails && (
                  <>
                    <dt>Contact</dt>
                    <dd>{item.contactDetails}</dd>
                  </>
                )}
              </dl>
            </article>

            <aside className="stack">
              {item.type === 'LOST' && (
                <Alert type="info" title="Did you find this?">
                  Please hand it in at the lost-and-found office and quote reference <strong className="mono">{item.reference}</strong>.
                  {item.contactDetails && <> You can also contact the owner: {item.contactDetails}</>}
                </Alert>
              )}
              {item.type === 'FOUND' && item.status === 'CLAIM_IN_PROGRESS' && (
                <Alert type="warning" title="Claim in progress">
                  The admin has approved a claim for this item. New claims are paused.
                </Alert>
              )}
              {item.type === 'FOUND' && item.status === 'OPEN' && !user && (
                <Alert type="info" title="Is this yours?">
                  <Link to="/login" state={{ from: `/lost-found/items/${item.id}` }}>
                    Log in
                  </Link>{' '}
                  to claim it.
                </Alert>
              )}
                           {mine && (
                <Alert type="info" title="This is your report">
                  You can&apos;t claim an item you reported. Manage it from <Link to={`/lost-found/my-reports/${item.id}`}>My Reports</Link>.
                </Alert>
              )}
              {item.type === 'FOUND' && item.status === 'OPEN' && user && !hasRole('ADMIN') && mine === false && <ClaimForm item={item} />}
            </aside>
          </div>
        </>
      )}
    </DataState>
  );
}
