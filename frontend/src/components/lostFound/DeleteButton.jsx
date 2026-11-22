import { useState } from 'react';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * Delete with a confirmation box, so nothing is deleted by mistake.
 * onDelete() may return a promise; errors are shown in the dialog.
 */
export default function DeleteButton({ what, name, onDelete, size = 'sm', label = 'Delete' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant="danger" icon="trash" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        title={`Delete this ${what}?`}
        message={`Are you sure you want to delete "${name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={onDelete}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
