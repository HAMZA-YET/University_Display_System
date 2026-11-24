import { useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { DataState } from '../../components/ui/States.jsx';
import useMemberQuery from '../data/useMemberQuery.js';
import { savePreferences } from '../data/memberApi.js';

export default function NotificationPreferences() {
  const preferences = useMemberQuery('/member-tools/preferences');
  return <section className="panel stack" aria-labelledby="notification-preferences-title"><h2 id="notification-preferences-title">Notification preferences</h2><p>In-app notifications include your lost-and-found case updates. The notice setting controls followed publications. Existing inbox history is retained; re-enabling delivery starts with new updates.</p><DataState {...preferences} onRetry={preferences.reload}>{(data) => <PreferenceEditor initial={data.data} />}</DataState></section>;
}
function PreferenceEditor({ initial }) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  async function submit(event) {
    event.preventDefault(); setPending(true); setMessage('');
    try { setDraft(await savePreferences(draft)); setError(false); setMessage('Notification preferences saved to your account.'); }
    catch (failure) { setError(true); setMessage(failure.message); }
    finally { setPending(false); }
  }
  return <form className="stack" onSubmit={submit}><fieldset className="stack" disabled={pending}><legend>In-app delivery</legend><label><input type="checkbox" checked={draft.inApp} onChange={(event) => setDraft({ ...draft, inApp: event.target.checked })} /> Enable in-app notifications</label><label><input type="checkbox" checked={draft.notices} onChange={(event) => setDraft({ ...draft, notices: event.target.checked })} /> Notice and linked event updates for followed topics</label></fieldset><Button type="submit" busy={pending}>Save preferences</Button>{message && <Alert type={error ? 'error' : 'success'}>{message}</Alert>}</form>;
}
