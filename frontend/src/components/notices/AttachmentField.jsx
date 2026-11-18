import { useId, useRef, useState } from 'react';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { uploadAttachment } from '../../api/notices';
import { formatBytes } from '../../lib/labels';

// Leave headroom for multipart overhead in Vercel's function request limit.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/**
 * Uploads files through the attachment gateway and keeps a list of
 * references ({ fileId, fileName, fileType, size, validationStatus }).
 */
export default function AttachmentField({ value = [], onChange }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setMessage({ type: 'error', text: 'Choose a file smaller than 4 MB.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const meta = await uploadAttachment(file);
      onChange([...value, meta]);
      if (meta.validationStatus !== 'VALID') {
        setMessage({ type: 'error', text: `"${meta.fileName}" was rejected: ${meta.rejectionReason || 'not an allowed file'}. Remove it before submitting.` });
      } else {
        setMessage({ type: 'success', text: `"${meta.fileName}" uploaded.` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={inputId}>Add attachment</label>
        <input ref={inputRef} id={inputId} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={handleFile} disabled={busy} />
        <span className="hint">PDF, PNG, JPG or DOCX. Maximum 4 MB. Files are checked before they can be published.</span>
      </div>
      {message && (
        <div className={`alert alert-${message.type === 'error' ? 'error' : 'success'}`} role="status">
          {message.text}
        </div>
      )}
      {value.length > 0 && (
        <ul className="attachment-list" aria-label="Attached files">
          {value.map((a) => (
            <li key={a.fileId}>
              <Icon name="file" />
              <span style={{ flex: 1 }}>
                {a.fileName} <span className="muted small">({formatBytes(a.size)})</span>
              </span>
              <span className={`badge ${a.validationStatus === 'VALID' ? 'badge-PUBLISHED' : 'badge-REJECTED'}`}>{a.validationStatus}</span>
              <Button variant="ghost" size="sm" icon="trash" onClick={() => onChange(value.filter((x) => x.fileId !== a.fileId))} aria-label={`Remove ${a.fileName}`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
