import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import Select from '../../components/ui/Select';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import useAuth from '../../hooks/useAuth';
import useQueryParams from '../../hooks/useQueryParams';
import { listUsers, changeRole, changeStatus } from '../../api/users';
import { ROLES, humanize } from '../../lib/labels';
import { formatDate } from '../../lib/time';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [params, setParams] = useQueryParams(['role', 'page']);
  const [pending, setPending] = useState(null);
  const [message, setMessage] = useState(null);
  const result = useApi(() => listUsers({ role: params.role, page: params.page || 1 }), [params.role, params.page]);

  const columns = [
    { key: 'name', header: 'Name', render: (u) => <strong>{u.name}</strong> },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Role',
      render: (u) =>
        u.id === me.id ? (
          <span>{u.role} (you)</span>
        ) : (
          <select aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => setPending({ type: 'role', user: u, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        ),
    },
    { key: 'active', header: 'Status', render: (u) => (u.isActive ? 'Active' : 'Deactivated') },
    { key: 'created', header: 'Created', render: (u) => formatDate(u.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) =>
        u.id !== me.id && (
          <Button size="sm" variant={u.isActive ? 'danger' : 'secondary'} onClick={() => setPending({ type: 'status', user: u, isActive: !u.isActive })}>
            {u.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Users and roles" description="Changing a role or status signs the user out of existing sessions. Every change is recorded in the audit log." />
      <div className="stack">
        {message && <Alert type="success">{message}</Alert>}
        <div style={{ maxWidth: 260 }}>
          <Select label="Filter by role" value={params.role} onChange={(e) => setParams({ role: e.target.value })} placeholder="All roles" options={ROLES.map((r) => ({ value: r, label: humanize(r) }))} />
        </div>
        <DataState {...result} onRetry={result.reload} isEmpty={(d) => !d.data.length} emptyTitle="No users">
          {(d) => (
            <>
              <Table caption="Users" columns={columns} rows={d.data} />
              <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />
            </>
          )}
        </DataState>
      </div>
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending && pending.type === 'role' ? 'Change role' : 'Change account status'}
        message={
          pending
            ? pending.type === 'role'
              ? `Change ${pending.user.name} from ${pending.user.role} to ${pending.role}?`
              : `${pending.isActive ? 'Activate' : 'Deactivate'} ${pending.user.name}?`
            : ''
        }
        confirmLabel="Confirm change"
        variant="primary"
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending.type === 'role') await changeRole(pending.user.id, pending.role);
          else await changeStatus(pending.user.id, pending.isActive);
          setMessage(`Updated ${pending.user.name}.`);
          result.reload();
        }}
      />
    </>
  );
}
