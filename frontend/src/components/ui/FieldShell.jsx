/** Shared label + hint + error wrapper used by every input component. */
export default function FieldShell({ id, label, hint, error, required, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={id}>
          {label}
          {required && (
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="visually-hidden"> (required)</span>}
        </label>
      )}
      {children}
      {hint && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

