import { useState } from 'react';
import Input from '../ui/Input';
import Checkbox from '../ui/Checkbox';
import DateTimeField from '../ui/DateTimeField';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import ConfirmDialog from '../ui/ConfirmDialog';
import { createEvent, updateEvent, deleteEvent } from '../../api/events';
import { toLocalInput, fromLocalInput, UNIVERSITY_TZ } from '../../lib/time';

const EMPTY = { title: '', start: '', end: '', venue: '', venueBuilding: '', venueRoom: '', organizer: '', allDay: false };

function toForm(e) {
  if (!e) return { ...EMPTY };
  return {
    title: e.title || '',
    start: toLocalInput(e.start),
    end: toLocalInput(e.end),
    venue: e.venue || '',
    venueBuilding: e.venueBuilding || '',
    venueRoom: e.venueRoom || '',
    organizer: e.organizer || '',
    allDay: Boolean(e.allDay),
  };
}

/**
 * Optional event linked to a draft notice. Saved separately through the
 * events API (an event always belongs to a notice).
 */
export default function EventForm(props) {
  return <EventFormFields key={`${props.noticeId || 'new'}:${props.event?.id || 'new'}:${props.event?.version || 0}`} {...props} />;
}

function EventFormFields({ noticeId, event, onChange, disabled }) {
  const [values, setValues] = useState(toForm(event));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [open, setOpen] = useState(Boolean(event));

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function validate() {
    const errs = {};
    if (values.title && values.title.trim().length < 3) errs.title = 'Title must be at least 3 characters';
    if (!values.start) errs.start = 'Start is required';
    if (!values.end) errs.end = 'End is required';
    if (values.start && values.end && values.end <= values.start) errs.end = 'End must be after start';
    if (values.venue.trim().length < 2) errs.venue = 'Venue is required';
    if (values.organizer.trim().length < 2) errs.organizer = 'Organizer is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function save() {
    setMessage(null);
    if (!validate()) return;
    setBusy(true);
    const body = {
      start: fromLocalInput(values.start),
      end: fromLocalInput(values.end),
      venue: values.venue.trim(),
      venueBuilding: values.venueBuilding.trim() || null,
      venueRoom: values.venueRoom.trim() || null,
      organizer: values.organizer.trim(),
      allDay: values.allDay,
      timezone: UNIVERSITY_TZ,
    };
    if (values.title.trim()) body.title = values.title.trim();
    try {
      const saved = event ? await updateEvent(event.id, body, event.version) : await createEvent({ noticeId, ...body });
      onChange(saved);
      setMessage({ type: 'success', text: 'Event saved.' });
    } catch (err) {
      const fieldErrs = {};
      (err.details || []).forEach((d) => {
        fieldErrs[d.field] = d.message;
      });
      setErrors(fieldErrs);
      setMessage({ type: 'error', text: err.code === 'VERSION_CONFLICT' ? `${err.message} Reload the page to see the latest event.` : err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!noticeId) {
    return (
      <fieldset>
        <legend>Event (optional)</legend>
        <p className="muted">Save the draft first, then you can add an event linked to this notice.</p>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend>Event (optional)</legend>
      {!open ? (
        <Button variant="secondary" icon="plus" onClick={() => setOpen(true)} disabled={disabled}>
          Add an event to this notice
        </Button>
      ) : (
        <div className="stack">
          <div className="form-grid">
            <Input className="span-2" label="Event name" hint="Leave empty to use the notice title." value={values.title} onChange={set('title')} error={errors.title} />
            <DateTimeField label="Start" required value={values.start} onChange={set('start')} error={errors.start} />
            <DateTimeField label="End" required value={values.end} onChange={set('end')} error={errors.end} />
            <Input label="Venue" required value={values.venue} onChange={set('venue')} error={errors.venue} />
            <Input label="Organizer" required value={values.organizer} onChange={set('organizer')} error={errors.organizer} />
            <Input label="Building (optional)" value={values.venueBuilding} onChange={set('venueBuilding')} />
            <Input label="Room (optional)" value={values.venueRoom} onChange={set('venueRoom')} />
            <Checkbox label="All-day event" checked={values.allDay} onChange={set('allDay')} />
          </div>
          {message && (
            <Alert type={message.type === 'error' ? 'error' : 'success'} role="status">
              {message.text}
            </Alert>
          )}
          <div className="row">
            <Button variant="secondary" onClick={save} busy={busy} disabled={disabled}>
              {event ? 'Save event changes' : 'Save event'}
            </Button>
            {event && (
              <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)} disabled={disabled}>
                Remove event
              </Button>
            )}
            {event && <span className="small muted">Event version {event.version}</span>}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Remove event"
        message="The event will be removed from this draft notice."
        confirmLabel="Remove event"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteEvent(event.id);
          onChange(null);
        }}
      />
    </fieldset>
  );
}
