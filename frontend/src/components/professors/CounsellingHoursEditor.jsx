import Button from '../ui/Button';
import { DAYS, dayName } from '../../lib/labels';
import { findSlotProblems } from '../../lib/counsellingHours';

export default function CounsellingHoursEditor({ value = [], onChange, serverError }) {
  const problems = findSlotProblems(value);
  const update = (i, field) => (e) => onChange(value.map((s, idx) => (idx === i ? { ...s, [field]: e.target.value } : s)));
  return (
    <fieldset>
      <legend>Counselling hours</legend>
      <div className="stack">
        {value.length === 0 && <p className="muted small">No counselling hours have been added.</p>}
        {value.map((slot, i) => (
          <div key={i} className="stack" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-3)' }}>
            <div className="grid grid-3">
              <div className="field">
                <label htmlFor={`slot-day-${i}`}>Day</label>
                <select id={`slot-day-${i}`} value={slot.day} onChange={update(i, 'day')}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {dayName(d)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`slot-start-${i}`}>Start (HH:mm)</label>
                <input id={`slot-start-${i}`} type="time" value={slot.startTime} onChange={update(i, 'startTime')} aria-invalid={problems[i] ? 'true' : undefined} />
              </div>
              <div className="field">
                <label htmlFor={`slot-end-${i}`}>End (HH:mm)</label>
                <input id={`slot-end-${i}`} type="time" value={slot.endTime} onChange={update(i, 'endTime')} aria-invalid={problems[i] ? 'true' : undefined} />
              </div>
              <div className="field">
                <label htmlFor={`slot-loc-${i}`}>Location (optional)</label>
                <input id={`slot-loc-${i}`} type="text" value={slot.location || ''} maxLength={100} onChange={update(i, 'location')} />
              </div>
              <div className="field">
                <label htmlFor={`slot-note-${i}`}>Note (optional)</label>
                <input id={`slot-note-${i}`} type="text" value={slot.note || ''} maxLength={200} onChange={update(i, 'note')} />
              </div>
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <Button variant="ghost" icon="trash" onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
                  Remove slot
                </Button>
              </div>
            </div>
            {problems[i] && (
              <span className="error" role="alert">
                {problems[i]}
              </span>
            )}
          </div>
        ))}
        {serverError && (
          <span className="error" role="alert">
            {serverError}
          </span>
        )}
        <div>
          <Button variant="secondary" icon="plus" onClick={() => onChange([...value, { day: 'MON', startTime: '14:00', endTime: '15:00', location: '', note: '' }])}>
            Add slot
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
