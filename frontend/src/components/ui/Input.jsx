import { forwardRef, useId } from 'react';
import FieldShell from './FieldShell';
import DateInput from './DateInput';
import { describedBy } from '../../lib/fieldAccessibility';

const Input = forwardRef(function Input({ label, hint, error, required, className, id: idProp, type = 'text', ...rest }, ref) {
  const autoId = useId();
  const id = idProp || autoId;
  const controlProps = {
    id, type,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy(id, hint, error),
    'aria-required': required || undefined,
    ...rest,
  };
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      {type === 'date'
        ? <DateInput ref={ref} calendarLabel={typeof label === 'string' ? label : rest['aria-label'] || 'date'} {...controlProps} />
        : <input ref={ref} {...controlProps} />}
    </FieldShell>
  );
});

export default Input;
