import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Table from '../../components/ui/Table';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import { invalidateDepartments } from '../../hooks/useDepartments';
import { createDepartment, deleteDepartment, listDepartments, updateDepartment } from '../../api/departments';

function DepartmentForm({ department, onSave, onCancel }) {
  const [values, setValues] = useState({ code: department?.code || '', name: department?.name || '', displayOrder: department?.displayOrder ?? 0 });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const body = { name: values.name.trim(), displayOrder: Number(values.displayOrder) };
    const issues = {};
    if (body.name.length < 2 || body.name.length > 160) issues.name = 'Name must be between 2 and 160 characters.';
    if (values.displayOrder === '' || !Number.isInteger(body.displayOrder) || body.displayOrder < 0 || body.displayOrder > 10000) issues.displayOrder = 'Display order must be a whole number from 0 to 10000.';
    if (!department) {
      body.code = values.code.trim().toUpperCase();
      if (!/^[A-Z]{2,10}$/.test(body.code)) issues.code = 'Use 2 to 10 letters for the department code.';
      else if (body.code === 'ALL') issues.code = 'ALL is reserved for university-wide notices.';
    }
    setErrors(issues);
    setError(null);
    if (Object.keys(issues).length) return;
    setBusy(true);
    try {
      await onSave(body);
    } catch (failure) {
      setError(failure.message || 'The department could not be saved.');
      setErrors(Object.fromEntries((failure.details || []).map((detail) => [detail.field, detail.message])));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-label={department ? 'Edit department' : 'Add department'}>
      <div className="form-grid">
        <Input label="Department code" value={values.code} onChange={set('code')} required maxLength={10} readOnly={Boolean(department)} disabled={busy} error={errors.code} autoCapitalize="characters" hint={department ? 'The department code cannot be changed.' : 'A unique code of 2 to 10 letters. Saved in uppercase.'} />
        <Input label="Department name" value={values.name} onChange={set('name')} required maxLength={160} disabled={busy} error={errors.name} />
        <Input label="Display order" type="number" value={values.displayOrder} onChange={set('displayOrder')} required min={0} max={10000} step={1} disabled={busy} error={errors.displayOrder} hint="Lower numbers appear first." />
      </div>
      {error && <Alert type="error">{error}</Alert>}
      <div className="form-actions">
        {onCancel && <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>}
        <Button type="submit" busy={busy}>{department ? 'Save changes' : 'Add department'}</Button>
      </div>
    </form>
  );
}

export default function AdminDepartments() {
  const result = useApi(listDepartments, []);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [flash, setFlash] = useState(null);
  const [createVersion, setCreateVersion] = useState(0);

  function changed(message) {
    invalidateDepartments();
    setFlash(message);
    result.reload();
  }

  const columns = [
    { key: 'code', header: 'Code', render: (department) => <strong>{department.code}</strong> },
    { key: 'name', header: 'Department' },
    { key: 'displayOrder', header: 'Display order' },
    { key: 'actions', header: 'Actions', render: (department) => (
      <div className="actions">
        <Button size="sm" variant="secondary" aria-label={`Edit ${department.code}`} onClick={() => setEditing(department)}>Edit</Button>
        <Button size="sm" variant="danger" aria-label={`Delete ${department.code}`} onClick={() => setDeleting(department)}>Delete</Button>
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader title="Manage departments" description="Create departments before adding professor profiles or department-specific notices." />
      <div className="stack">
        {flash && <Alert type="success">{flash}</Alert>}
        <section className="panel" aria-labelledby="add-department-title">
          <h2 id="add-department-title">Add a department</h2>
          <DepartmentForm key={createVersion} onSave={async (body) => {
            const created = await createDepartment(body);
            setCreateVersion((version) => version + 1);
            changed(`Added ${created.name}.`);
          }} />
        </section>
        <DataState {...result} onRetry={result.reload}>
          {(departments) => <Table caption="Departments" columns={columns} rows={departments} emptyText="No departments yet. Add your first department above." />}
        </DataState>
      </div>
      <Modal open={Boolean(editing)} title={editing ? `Edit ${editing.code}` : ''} onClose={() => setEditing(null)}>
        {editing && <DepartmentForm key={editing.id} department={editing} onCancel={() => setEditing(null)} onSave={async (body) => {
          const updated = await updateDepartment(editing.id, body);
          setEditing(null);
          changed(`Updated ${updated.name}.`);
        }} />}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete department" confirmLabel="Delete department" message={deleting ? `Delete ${deleting.name} (${deleting.code})? Only unused departments can be deleted. This cannot be undone.` : ''} onClose={() => setDeleting(null)} onConfirm={async () => {
        await deleteDepartment(deleting.id);
        changed(`Deleted ${deleting.name}.`);
      }} />
    </>
  );
}
