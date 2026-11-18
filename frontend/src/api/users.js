import api from './client';

const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const listUsers = (params) => api.get('/users', { params: clean(params) }).then((r) => r.data);
export const changeRole = (id, role) => api.patch(`/users/${id}/role`, { role }).then((r) => r.data.data);
export const changeStatus = (id, isActive) => api.patch(`/users/${id}/status`, { isActive }).then((r) => r.data.data);

export const adminSummary = () => api.get('/admin/summary').then((r) => r.data.data);
export const listDomainEvents = (params) => api.get('/domain-events', { params: clean(params) }).then((r) => r.data);
export const listAuditLogs = (params) => api.get('/audit-logs', { params: clean(params) }).then((r) => r.data);
