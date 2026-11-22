import { useId, useState } from 'react';
import Alert from '../ui/Alert';
import Icon from '../ui/Icon';
import { uploadPhoto, removePhoto, privatePhotoUrl } from '../../api/lostFound';
import { MAX_PHOTOS, PHOTO_ACCEPT, PHOTO_HINT, checkPhoto } from '../../lib/lostFoundPhotos';

/** Reporter's photo editor on an existing report. */
export default function PhotoManager({ item, onChange }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const editable = ['OPEN', 'COLLECTION_APPROVED'].includes(item.status);
  const photoIds = item.photoIds || [];

  async function add(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkPhoto(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadPhoto(item.id, file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(photoId) {
    setBusy(true);
    setError(null);
    try {
      onChange(await removePhoto(item.id, photoId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="lf-thumbs" aria-busy={busy || undefined}>
        {photoIds.map((id, i) => (
          <div key={id} className="lf-thumb" style={{ cursor: 'default' }}>
            <img src={privatePhotoUrl(item.id, id)} alt={`Photo ${i + 1}`} />
            {editable && (
              <button
                type="button"
                className="lf-thumb-remove"
                onClick={() => remove(id)}
                disabled={busy}
                aria-label={`Remove photo ${i + 1}`}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
        {editable && photoIds.length < MAX_PHOTOS && (
          <label className="lf-photo-add" htmlFor={inputId}>
            <input id={inputId} type="file" accept={PHOTO_ACCEPT} onChange={add} disabled={busy} />
            <span>{busy ? 'Uploading...' : '+ Add photo'}</span>
          </label>
        )}
      </div>
      {photoIds.length === 0 && !editable && <p className="muted small">No photos.</p>}
      {editable && (
        <p className="small muted" style={{ margin: 0 }}>
          {PHOTO_HINT}
        </p>
      )}
      {error && <Alert type="error">{error}</Alert>}
    </div>
  );
}
