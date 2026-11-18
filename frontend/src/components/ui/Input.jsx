import { forwardRef, useId } from 'react';
import FieldShell from './FieldShell';
import { describedBy } from '../../lib/fieldAccessibility';

const Input = forwardRef(function Input({ label, hint, error, required, className, id: idProp, type = 'text', ...rest }, ref) {
  const autoId = useId();
  const id = idProp || autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input
        ref={ref}
        id={id}
        type={type}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        aria-required={required || undefined}
        {...rest}
      />
    </FieldShell>
  );
});

export default Input;
