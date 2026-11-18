import { forwardRef, useId } from 'react';
import FieldShell from './FieldShell';
import { describedBy } from '../../lib/fieldAccessibility';

const Textarea = forwardRef(function Textarea({ label, hint, error, required, className, id: idProp, rows = 5, ...rest }, ref) {
  const autoId = useId();
  const id = idProp || autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        aria-required={required || undefined}
        {...rest}
      />
    </FieldShell>
  );
});

export default Textarea;
