import { lfLabel } from '../../lib/lostFoundLabels';

export function TypeTag({ type }) {
  return <span className={`lf-type lf-type-${type}`}>{type === 'LOST' ? 'LOST' : 'FOUND'}</span>;
}

/** Item status (e.g. "Claim in progress"). Always text plus colour. */
export function ItemStatusBadge({ status }) {
  if (!status) return null;
  return (
    <span className={`badge badge-lfs-${status}`}>
      <span className="visually-hidden">Status: </span>
      {lfLabel(status).toUpperCase()}
    </span>
  );
}

/** Claim status: Pending / Approved / Rejected. */
export function ClaimStatusBadge({ status }) {
  if (!status) return null;
  return (
    <span className={`badge badge-lfc-${status}`}>
      <span className="visually-hidden">Claim status: </span>
      {lfLabel(status).toUpperCase()}
    </span>
  );
}
