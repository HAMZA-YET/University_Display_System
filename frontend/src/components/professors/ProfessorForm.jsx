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
    department: p.department || '',
    officeRoom: p.officeRoom || '',
    officeBuilding: p.officeBuilding || '',
    email: p.email || '',
    phone: p.phone || '',
    profileImage: p.profileImage || '',
    counsellingHours: (p.counsellingHours || []).map((s) => ({ ...s, location: s.location || '', note: s.note || '' })),
  };
}

/** Add/Edit professor form (admin). onSave(body) returns a promise. */
export default function ProfessorForm({ professor, departments, onSave, onCancel }) {
  const official = Boolean(professor?.sourceKey);
  const [values, setValues] = useState(toForm(professor));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function validate() {
    const e = {};
    if (values.name.trim().length < 2) e.name = 'Name must be at least 2 characters';
    if (!official && !values.department) e.department = 'Department is required';
    if (!values.position) e.position = 'Position is required';
    if (!official && !values.officeRoom.trim()) e.officeRoom = 'Office room is required';
    if (!official && !values.officeBuilding.trim()) e.officeBuilding = 'Office building is required';
    if ((!official || values.email.trim()) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) e.email = 'Email format is not valid';
    if (values.phone && !/^\+?[0-9][0-9 ()-]{6,19}$/.test(values.phone.trim())) e.phone = 'Phone number format is not valid';
    if (values.profileImage && !/^https?:\/\//i.test(values.profileImage.trim()) && !/^\/assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)$/i.test(values.profileImage.trim())) e.profileImage = 'Use an http or https URL, or a local /assets/ image path';
    if (!official && values.subjects.length < 1) e.subjects = 'Add at least one subject';
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
      department: values.department || null,
      position: values.position,
      officeRoom: values.officeRoom.trim() || null,
      officeBuilding: values.officeBuilding.trim() || null,
      email: values.email.trim() || null,
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
      {official && <Alert type="info">This profile comes from KDU’s published faculty list. Roles and qualifications retain the source wording. Leave unpublished contact, department, office and teaching information blank.</Alert>}
      <div className="form-grid">
        <Input label="Name" required value={values.name} onChange={set('name')} error={errors.name} />
        <Input label="Title prefix (optional)" value={values.titlePrefix} onChange={set('titlePrefix')} hint="For example Dr." />
        <Select label="Department" required={!official} placeholder={official ? 'Not published' : 'Choose a department'} value={values.department} onChange={set('department')} error={errors.department} options={departments.map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))} />
        <Select label="Position" required disabled={official} hint={official ? `Published designation: ${professor.positionLabel}` : undefined} placeholder="Choose a position" value={values.position} onChange={set('position')} error={errors.position} options={POSITIONS.map((p) => ({ value: p, label: humanize(p) }))} />
        <Input label="Office room" required={!official} value={values.officeRoom} onChange={set('officeRoom')} error={errors.officeRoom} />
        <Input label="Office building" required={!official} value={values.officeBuilding} onChange={set('officeBuilding')} error={errors.officeBuilding} />
        <Input label="Email" type="email" required={!official} value={values.email} onChange={set('email')} error={errors.email} />
        <Input label="Phone (optional)" type="tel" value={values.phone} onChange={set('phone')} error={errors.phone} />
        <Input className="span-2" label="Profile image URL (optional)" value={values.profileImage} onChange={set('profileImage')} error={errors.profileImage} hint="Use https or a local /assets/ image. Leave empty to show initials." />
        <div className="span-2">
          <SubjectsEditor optional={official} value={values.subjects} onChange={(subjects) => setValues((v) => ({ ...v, subjects }))} error={errors.subjects} />
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
