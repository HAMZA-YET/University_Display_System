import { useId, useState } from 'react';
import Button from '../ui/Button';

/** Dynamic subject list: add and remove items. Duplicates are ignored (case-insensitive). */
export default function SubjectsEditor({ value = [], onChange, error }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState(null);

  function add() {
    const s = draft.trim();
    if (s.length < 2) {
      setNote('A subject must be at least 2 characters.');
      return;
    }
    if (value.some((v) => v.toLowerCase() === s.toLowerCase())) {
      setNote(`"${s}" is already in the list.`);
      return;
    }
    if (value.length >= 20) {
      setNote('At most 20 subjects.');
      return;
    }
    onChange([...value, s]);
    setDraft('');
    setNote(null);
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        Subjects<span className="required-mark" aria-hidden="true">*</span>
      </label>
      <div className="row">
        <input
          id={id}
          type="text"
          value={draft}
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          style={{ flex: 1 }}
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? 'true' : undefined}
        />
        <Button variant="secondary" icon="plus" onClick={add}>
          Add subject
        </Button>
      </div>
      <span className="hint" id={`${id}-hint`}>
        Between 1 and 20 subjects. Press Enter or Add subject.
      </span>
      {(note || error) && (
        <span className="error" role="alert">
          {note || error}
        </span>
      )}
      {value.length > 0 && (
        <ul className="attachment-list" aria-label="Subjects">
          {value.map((s) => (
            <li key={s}>
              <span style={{ flex: 1 }}>{s}</span>
              <Button variant="ghost" size="sm" icon="trash" onClick={() => onChange(value.filter((x) => x !== s))} aria-label={`Remove subject ${s}`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
