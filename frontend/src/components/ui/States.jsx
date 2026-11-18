import Button from './Button';
import Icon from './Icon';

export function EmptyState({ title = 'Nothing to show', children }) {
  return (
    <div className="state-box">
      <Icon name="file" size={28} />
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading...' }) {
  return (
    <div className="state-box" role="status" aria-live="polite">
      <Icon name="clock" size={28} />
      <h3>{label}</h3>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="state-box" role="alert">
      <Icon name="alert" size={28} />
      <h3>{title}</h3>
      <p>{error && error.message ? error.message : 'The data could not be loaded.'}</p>
      {error && error.requestId && <p className="small mono">Reference: {error.requestId}</p>}
      {onRetry && (
        <Button variant="secondary" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Renders loading, error or empty states, otherwise children(data). */
export function DataState({ loading, error, data, onRetry, isEmpty, emptyTitle, emptyText, children }) {
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!data || (isEmpty && isEmpty(data))) return <EmptyState title={emptyTitle}>{emptyText}</EmptyState>;
  return children(data);
}
