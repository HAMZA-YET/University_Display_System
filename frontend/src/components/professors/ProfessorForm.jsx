import { useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Checkbox from '../ui/Checkbox';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import SubjectsEditor from './SubjectsEditor';
import CounsellingHoursEditor from './CounsellingHoursEditor';
import { findSlotProblems } from '../../lib/counsellingHours';
import { POSITIONS, humanize } from '../../lib/labels';

const EMPTY = {
  name: '',
  titlePrefix: '',
  department: '',
  position: '',
  officeRoom: '',
  officeBuilding: '',
  email: '',
  phone: '',
  profileImage: '',
  subjects: [],
  counsellingHours: [],
  isActive: true,
};

function toForm(p) {
  if (!p) return { ...EMPTY };
  return {
    ...EMPTY,
    ...p,
    titlePrefix: p.titlePrefix || '',
    phone: p.phone || '',
    profileImage: p.profileImage || '',
    counsellingHours: (p.counsellingHours || []).map((s) => ({ ...s, location: s.location || '', note: s.note || '' })),
  };
}

/** Add/Edit professor form (admin). onSave(body) returns a promise. */
export default function ProfessorForm({ professor, departments, onSave, onCancel }) {
  const [values, setValues] = useState(toForm(professor));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function validate() {
    const e = {};
    if (values.name.trim().length < 2) e.name = 'Name must be at least 2 characters';
    if (!values.department) e.department = 'Department is required';
    if (!values.position) e.position = 'Position is required';
    if (!values.officeRoom.trim()) e.officeRoom = 'Office room is required';
    if (!values.officeBuilding.trim()) e.officeBuilding = 'Office building is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) e.email = 'Email format is not valid';
    if (values.phone && !/^\+?[0-9][0-9 ()-]{6,19}$/.test(values.phone.trim())) e.phone = 'Phone number format is not valid';
    if (values.profileImage && !/^https?:\/\//i.test(values.profileImage.trim())) e.profileImage = 'Use an http or https URL';
    if (values.subjects.length < 1) e.subjects = 'Add at least one subject';
    if (Object.keys(findSlotProblems(values.counsellingHours)).length) e.counsellingHours = 'Fix the counselling hours above';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    setFormError(null);
    if (!validate()) {
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setBusy(true);
    const body = {
      name: values.name.trim(),
      titlePrefix: values.titlePrefix.trim() || null,
      department: values.department,
      position: values.position,
      officeRoom: values.officeRoom.trim(),
      officeBuilding: values.officeBuilding.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || null,
      profileImage: values.profileImage.trim() || null,
      subjects: values.subjects,
      counsellingHours: values.counsellingHours.map((s) => ({
        day: s.day,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location ? s.location.trim() : null,
        note: s.note ? s.note.trim() : null,
      })),
      isActive: values.isActive,
    };
    try {
      await onSave(body);
    } catch (err) {
      const fieldErrs = {};
      (err.details || []).forEach((d) => {
        fieldErrs[String(d.field).split('.')[0]] = d.message;
      });
      setErrors(fieldErrs);
      setFormError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="stack" aria-label="Professor form">
      <div className="form-grid">
        <Input label="Name" required value={values.name} onChange={set('name')} error={errors.name} />
        <Input label="Title prefix (optional)" value={values.titlePrefix} onChange={set('titlePrefix')} hint="For example Dr." />
        <Select label="Department" required placeholder="Choose a department" value={values.department} onChange={set('department')} error={errors.department} options={departments.map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))} />
        <Select label="Position" required placeholder="Choose a position" value={values.position} onChange={set('position')} error={errors.position} options={POSITIONS.map((p) => ({ value: p, label: humanize(p) }))} />
        <Input label="Office room" required value={values.officeRoom} onChange={set('officeRoom')} error={errors.officeRoom} />
        <Input label="Office building" required value={values.officeBuilding} onChange={set('officeBuilding')} error={errors.officeBuilding} />
        <Input label="Email" type="email" required value={values.email} onChange={set('email')} error={errors.email} />
        <Input label="Phone (optional)" type="tel" value={values.phone} onChange={set('phone')} error={errors.phone} />
        <Input className="span-2" label="Profile image URL (optional)" type="url" value={values.profileImage} onChange={set('profileImage')} error={errors.profileImage} hint="Leave empty to show an initials placeholder." />
        <div className="span-2">
          <SubjectsEditor value={values.subjects} onChange={(subjects) => setValues((v) => ({ ...v, subjects }))} error={errors.subjects} />
        </div>
        <div className="span-2">
          <CounsellingHoursEditor value={values.counsellingHours} onChange={(counsellingHours) => setValues((v) => ({ ...v, counsellingHours }))} serverError={errors.counsellingHours} />
        </div>
        <Checkbox label="Show in the public directory (active)" checked={values.isActive} onChange={set('isActive')} />
      </div>
      {formError && <Alert type="error">{formError}</Alert>}
      <div className="form-actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          {professor ? 'Save changes' : 'Add professor'}
        </Button>
      </div>
    </form>
  );
}
