import Button from './Button';

export default function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  const { page, totalPages, total } = meta;
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button variant="secondary" size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span aria-live="polite">
        Page {page} of {totalPages} <span className="muted">({total} items)</span>
      </span>
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
