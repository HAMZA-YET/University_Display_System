import { forwardRef, useId } from 'react';

const Checkbox = forwardRef(function Checkbox({ label, hint, id: idProp, ...rest }, ref) {
  const autoId = useId();
  const id = idProp || autoId;
  return (
    <div className="field">
      <label className="checkbox" htmlFor={id}>
        <input ref={ref} id={id} type="checkbox" aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
        <span>{label}</span>
      </label>
      {hint && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
});

export default Checkbox;
