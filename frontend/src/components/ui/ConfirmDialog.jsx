import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Textarea from './Textarea';
import Alert from './Alert';

/**
 * Confirmation for destructive or irreversible actions. When requireReason is
 * set, the user must type a reason of at least `minReason` characters.
 * onConfirm(reason) may return a promise; errors are shown in the dialog.
 */
export default function ConfirmDialog(props) {
  return props.open ? <ConfirmDialogContent {...props} /> : null;
}

function ConfirmDialogContent({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  requireReason = false,
  minReason = 10,
  reasonLabel = 'Reason',
  onConfirm,
  onClose,
  children,
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const tooShort = requireReason && reason.trim().length < minReason;

  async function handleConfirm() {
    if (tooShort) {
      setError(`Please give a reason of at least ${minReason} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(requireReason ? reason.trim() : undefined);
      onClose();
    } catch (err) {
      setError(err.message || 'The action failed.');
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={variant} onClick={handleConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">
        {message && <p>{message}</p>}
        {children}
        {requireReason && (
          <Textarea
            label={reasonLabel}
            required
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint={`At least ${minReason} characters. ${reason.trim().length} typed.`}
            error={error && tooShort ? error : undefined}
          />
        )}
        {error && !tooShort && <Alert type="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
