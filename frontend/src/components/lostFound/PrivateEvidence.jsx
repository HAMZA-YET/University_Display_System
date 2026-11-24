import { useEffect, useRef, useState } from 'react';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import { evidenceCapabilities, listEvidence, uploadEvidence, deleteEvidence, downloadEvidence } from '../../api/security';
import useAuth from '../../hooks/useAuth';

/** Files always use authenticated requests; no storage URL is rendered. */
export default function PrivateEvidence(props) {
  const { user } = useAuth();
  return user ? <ProofFiles key={`${user.id}:${props.claimId}`} {...props} /> : null;
}

function ProofFiles({ claimId, canUpload = false, canDelete = false }) {
  const active = useRef(true);
  const running = useRef(false);
  const [files, setFiles] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    active.current = true;
    Promise.all([listEvidence(claimId), evidenceCapabilities()]).then(([items, config]) => {
      if (active.current) { setFiles(items); setCapabilities(config); }
    }).catch(e => { if (active.current) setError(e.message); }).finally(() => { if (active.current) setLoading(false); });
    return () => { active.current = false; };
  }, [claimId]);

  async function run(work) {
    if (running.current || !active.current) return;
    running.current = true;
    setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (e) { if (active.current) setError(e.message); } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function upload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.namedItem('file')?.files?.[0];
    if (!file?.size) return;
    if (file.size > capabilities.maxBytes) { setError(`Choose a file no larger than ${capabilities.maxBytes / 1024 / 1024} MiB.`); return; }
    await run(async () => {
      await uploadEvidence(claimId, file);
      if (!active.current) return;
      const items = await listEvidence(claimId);
      if (!active.current) return;
      setFiles(items); form.reset(); setMessage('Private proof attached.');
    });
  }
  async function download(file) {
    await run(async () => {
      const data = await downloadEvidence(claimId, file.fileId);
      if (!active.current) return;
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  return <section className="panel stack" aria-label="Private proof files">
    <h2>Private proof files</h2>
    <p className="small muted">Only the claimant and an authorized administrator can view these files. Written proof remains part of the claim.</p>
    {error && <Alert type="error">{error}</Alert>}{message && <Alert type="success">{message}</Alert>}
    {loading ? <p className="muted">Loading proof files…</p> : <>
      {files.length === 0 ? <p className="muted">No proof files attached.</p> : <ul className="stack">{files.map(file => <li key={file.fileId}>
        <span style={{ overflowWrap: 'anywhere' }}>{file.name}</span>{' '}
        <Button size="sm" busy={busy} onClick={() => download(file)}>Download</Button>{' '}
        {canDelete && <Button size="sm" disabled={busy} onClick={() => run(async () => {
          await deleteEvidence(claimId, file.fileId);
          if (!active.current) return;
          setFiles(items => items.filter(item => item.fileId !== file.fileId)); setMessage('Proof file removed.');
        })}>Remove</Button>}
      </li>)}</ul>}
      {canUpload && capabilities?.available && <form className="stack" onSubmit={upload}>
        <p className="small muted">Each claim can retain up to {capabilities.maxFilesPerClaim || 10} proof files. Removing a file does not free a slot.</p>
        <label className="field-label" htmlFor={`proof-${claimId}`}>Attach a JPEG or PNG image (up to {capabilities.maxBytes / 1024 / 1024} MiB)</label>
        <input id={`proof-${claimId}`} type="file" name="file" accept="image/jpeg,image/png" required disabled={busy} />
        <Button type="submit" busy={busy}>Attach private proof</Button>
      </form>}
      {canUpload && capabilities && !capabilities.available && <p className="muted">Proof-file uploads are unavailable. Your written claim can still be reviewed.</p>}
    </>}
  </section>;
}
