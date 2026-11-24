import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Alert from '../../components/ui/Alert';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import ProfessorForm from '../../components/professors/ProfessorForm';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import useDebounce from '../../hooks/useDebounce';
import useUrlInput from '../../hooks/useUrlInput';
import useQueryParams from '../../hooks/useQueryParams';
import useDepartments from '../../hooks/useDepartments';
import { listProfessors, createProfessor, updateProfessor, deleteProfessor } from '../../api/professors';
import { humanize, dayName } from '../../lib/labels';

/** All professor data comes from MongoDB through the API. */
export default function AdminProfessors() {
  const [params, setParams] = useQueryParams(['department', 'q', 'page']);
  const { departments, byCode } = useDepartments();
  const [q, setQ] = useUrlInput(params.q);
  const debounced = useDebounce(q, 300);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (debounced !== params.q) setParams({ q: debounced }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const result = useApi(
    () => listProfessors({ department: params.department, q: params.q, page: params.page || 1, limit: 25, includeInactive: 'true' }),
    [params.department, params.q, params.page]
  );

  async function save(body) {
    if (editing && editing.id) {
      await updateProfessor(editing.id, body, editing.version);
      setFlash(`Saved changes to ${body.name}.`);
    } else {
      await createProfessor(body);
      setFlash(`Added ${body.name}.`);
    }
    setEditing(null);
    result.reload();
  }

  const columns = [
    { key: 'name', header: 'Name', render: (p) => <strong>{[p.titlePrefix, p.name].filter(Boolean).join(' ')}</strong> },
    { key: 'department', header: 'Department', render: (p) => byCode[p.department] || p.department || 'Not published' },
    { key: 'position', header: 'Position', render: (p) => p.positionLabel || humanize(p.position) },
    { key: 'office', header: 'Office', render: (p) => [p.officeRoom, p.officeBuilding].filter(Boolean).join(', ') || 'Not published' },
    { key: 'subjects', header: 'Subjects', render: (p) => (p.subjects || []).join(', ') || 'Not published' },
    { key: 'hours', header: 'Counselling', render: (p) => p.counsellingHours.map((h) => `${dayName(h.day).slice(0, 3)} ${h.startTime}-${h.endTime}`).join('; ') || '-' },
    { key: 'active', header: 'Listed', render: (p) => (p.isActive ? 'Yes' : 'No') },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div className="actions">
          <Button size="sm" variant="secondary" icon="edit" onClick={() => setEditing(p)}>
            Edit
          </Button>
          <Button size="sm" variant="danger" icon="trash" onClick={() => setDeleting(p)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Manage professors"
        actions={
          <Button icon="plus" disabled={!departments.length} onClick={() => setEditing({})}>
            Add professor
          </Button>
        }
      />
      <div className="stack">
        {flash && <Alert type="success">{flash}</Alert>}
        {!departments.length && <Alert type="info">Add a department before creating a professor profile. <Link to="/admin/departments">Manage departments</Link></Alert>}
        <div className="grid grid-2">
          <Input label="Search by name or subject" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select label="Department" value={params.department} onChange={(e) => setParams({ department: e.target.value })} placeholder="All departments" options={departments.map((d) => ({ value: d.code, label: d.name }))} />
        </div>
        <DataState {...result} onRetry={result.reload} isEmpty={(d) => !d.data.length} emptyTitle="No professors found">
          {(d) => (
            <>
              <Table caption="Professors" columns={columns} rows={d.data} />
              <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />
            </>
          )}
        </DataState>
      </div>

      <Modal open={Boolean(editing)} wide title={editing && editing.id ? `Edit ${editing.name}` : 'Add professor'} onClose={() => setEditing(null)}>
        {editing && <ProfessorForm professor={editing.id ? editing : null} departments={departments} onSave={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete professor"
        message={deleting ? `Delete ${deleting.name} from the directory? This cannot be undone and is recorded in the audit log.` : ''}
        confirmLabel="Delete professor"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteProfessor(deleting.id);
          setFlash(`Deleted ${deleting.name}.`);
          result.reload();
        }}
      />
    </>
  );
}
