import { useState } from 'react';
import Table from '../ui/Table';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * Wraps the shared Table with an optional selection mode for deleting several
 * rows at once. The existing per-row delete is unchanged.
 *
 * - A "Select" button appears when there is at least one row.
 * - Pressing it turns on selection mode: a checkbox appears on each row, plus
 *   a "Select all" control. Any row can be ticked or unticked.
 * - "Delete selected (N)" confirms (showing the count) before deleting.
 * - "Cancel" leaves selection mode and clears the selection.
 */
export default function BulkDeletableTable({ columns, rows, caption, deleteOne, onDone, itemNoun = 'report' }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ids = rows.map((r) => r.id);
  const selectedIds = ids.filter((id) => selected.has(id));
  const count = selectedIds.length;
  const allChecked = ids.length > 0 && count === ids.length;
  const someChecked = count > 0 && !allChecked;
  const setIndeterminate = (el) => {
    if (el) el.indeterminate = someChecked;
  };

  function exitSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function deleteSelected() {
    const targets = rows.filter((r) => selected.has(r.id));
    let failed = 0;
    for (const r of targets) {
      try {
        await deleteOne(r.id);
      } catch {
        failed += 1;
      }
    }
    setSelected(new Set());
    setSelecting(false);
    if (onDone) await onDone();
    if (failed > 0) {
      throw new Error(`${targets.length - failed} deleted, but ${failed} could not be deleted. Please try again.`);
    }
  }

  const selectColumn = {
    key: '_select',
    header: 'Select',
    className: 'lf-check-col',
    render: (r) => (
      <input
        type="checkbox"
        aria-label={`Select ${r.title || `this ${itemNoun}`}`}
        checked={selected.has(r.id)}
        onChange={() => toggleOne(r.id)}
      />
    ),
  };

  return (
    <>
      {rows.length > 0 && (
        <div className="lf-bulk-bar">
          {!selecting ? (
            <Button size="sm" variant="secondary" icon="check" onClick={() => setSelecting(true)}>
              Select
            </Button>
          ) : (
            <>
              <label className="lf-bulk-all">
                <input type="checkbox" checked={allChecked} ref={setIndeterminate} onChange={toggleAll} />
                Select all ({ids.length})
              </label>
              {count > 0 && (
                <>
                  <span className="lf-bulk-count" aria-live="polite">
                    {count} selected
                  </span>
                  <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirmOpen(true)}>
                    Delete selected ({count})
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={exitSelecting}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
      <Table caption={caption} columns={selecting ? [selectColumn, ...columns] : columns} rows={rows} />
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${count} ${itemNoun}${count === 1 ? '' : 's'}?`}
        message={`You are about to delete ${count} ${itemNoun}${count === 1 ? '' : 's'}. This cannot be undone.`}
        confirmLabel={`Delete ${count} ${itemNoun}${count === 1 ? '' : 's'}`}
        onConfirm={deleteSelected}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
