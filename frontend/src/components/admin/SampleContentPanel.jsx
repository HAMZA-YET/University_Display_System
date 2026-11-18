import { useState } from 'react';
import useAuth from '../../hooks/useAuth';
import useApi from '../../hooks/useApi';
import { invalidateDepartments } from '../../hooks/useDepartments';
import { installSampleContent, sampleContentStatus } from '../../api/sampleContent';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Alert from '../ui/Alert';
import { ErrorState, LoadingState } from '../ui/States';
import ConfirmDialog from '../ui/ConfirmDialog';

export default function SampleContentPanel(props) {
  const { hasRole } = useAuth();
  return hasRole('ADMIN') ? <AdministratorSamples {...props} /> : null;
}

function AdministratorSamples({ onInstalled }) {
  const status = useApi(sampleContentStatus, []);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [installedStatus, setInstalledStatus] = useState(null);
  const current = installedStatus || status.data;

  async function install() {
    if (busy || !current || current.complete) return;
    setBusy(true);
    try {
      const confirmed = await installSampleContent();
      setInstalledStatus(confirmed);
      invalidateDepartments();
      onInstalled?.();
    } finally {
      setBusy(false);
    }
  }

  return <section className="sample-content-panel" aria-labelledby="sample-content-title">
    <div className="sample-panel-heading"><span className="sample-panel-icon"><Icon name="book" size={24} /></span><div><p className="eyebrow">BUILD A CAMPUS PREVIEW</p><h2 id="sample-content-title">Sample content</h2></div><span className="sample-badge">Fictional examples</span></div>
    <p>Populate the portal with clearly labelled fictional examples: up to 6 departments, 6 professor profiles, 12 published notices, and 6 events. Existing content is preserved. Sample publishing does not send notifications to existing users.</p>
    <p className="small muted">These examples will be visible on the public portal. No accounts or sign-in credentials are created.</p>
    {status.loading && !current ? <LoadingState label="Checking sample content..." /> : status.error && !current ? <ErrorState error={status.error} onRetry={status.reload} /> : current && <>
      <dl className="sample-counts">{['departments', 'professors', 'notices', 'events'].map((kind) => <div key={kind}><dt>{kind}</dt><dd>{current.counts[kind] || 0}</dd></div>)}</dl>
      <p className="small muted">Counts show stored sample records. Existing departments are reused; edited or withdrawn samples are never overwritten.</p>
      {installedStatus && <Alert type="success" title="Sample content is installed">Published examples can be explored on the home page. Existing records were preserved.</Alert>}
      <div className="sample-panel-actions"><Button icon="plus" busy={busy} disabled={current.complete} onClick={() => setConfirmOpen(true)}>{current.complete ? 'Sample content installed' : current.installed ? 'Complete sample content' : 'Install sample content'}</Button><span className="small muted">{current.complete ? 'The sample set has already been installed.' : 'Safe to run again: existing samples are not duplicated.'}</span></div>
    </>}
    <ConfirmDialog open={confirmOpen} title="Install sample content" confirmLabel="Install sample content" variant="primary" message="Add fictional examples to the public portal: up to 6 departments, 6 professor profiles, 12 published notices, and 6 events. Existing records will be preserved. No accounts or sign-in credentials are created, and sample publishing does not notify existing users." onClose={() => setConfirmOpen(false)} onConfirm={install} />
  </section>;
}
