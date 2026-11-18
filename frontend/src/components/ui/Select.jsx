import { forwardRef, useId } from 'react';
import FieldShell from './FieldShell';
import { describedBy } from '../../lib/fieldAccessibility';

/** options: [{ value, label }] */
const Select = forwardRef(function Select(
  { label, hint, error, required, className, id: idProp, options = [], placeholder, ...rest },
  ref
) {
  const autoId = useId();
  const id = idProp || autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, hint, error)}
        aria-required={required || undefined}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

export default Select;
