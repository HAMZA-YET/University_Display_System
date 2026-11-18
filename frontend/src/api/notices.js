import api, { ifMatch } from './client';

const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

// Public
export const listPublicNotices = (params) => api.get('/public/notices', { params: clean(params) }).then((r) => r.data);
export const getPublicNotice = (id) => api.get(`/public/notices/${id}`).then((r) => r.data.data);
export const getHome = () => api.get('/public/home').then((r) => r.data.data);
export const listDepartments = () => api.get('/departments').then((r) => r.data.data);

// Management
export const listNotices = (params) => api.get('/notices', { params: clean(params) }).then((r) => r.data);
export const getNotice = (id) => api.get(`/notices/${id}`).then((r) => r.data.data);
export const createNotice = (body) => api.post('/notices', body).then((r) => r.data.data);
export const updateNotice = (id, body, version) => api.patch(`/notices/${id}`, body, ifMatch(version)).then((r) => r.data.data);
export const deleteNotice = (id) => api.delete(`/notices/${id}`).then((r) => r.data.data);
export const previewNotice = (id) => api.get(`/notices/${id}/preview`).then((r) => r.data.data);
export const submitNotice = (id, version) => api.post(`/notices/${id}/submit`, {}, version ? ifMatch(version) : undefined).then((r) => r.data.data);
export const approveNotice = (id, body) => api.post(`/notices/${id}/approve`, body).then((r) => r.data);
export const rejectNotice = (id, reason) => api.post(`/notices/${id}/reject`, { reason }).then((r) => r.data.data);
export const returnNotice = (id, reason) => api.post(`/notices/${id}/return`, { reason }).then((r) => r.data.data);
export const withdrawNotice = (id, reason) => api.post(`/notices/${id}/withdraw`, { reason }).then((r) => r.data);
export const archiveNotice = (id) => api.post(`/notices/${id}/archive`, {}).then((r) => r.data);
export const updatePlacement = (id, body, version) => api.patch(`/notices/${id}/placement`, body, ifMatch(version)).then((r) => r.data.data);
export const reviewQueue = (params) => api.get('/notices/review-queue', { params: clean(params) }).then((r) => r.data);
export const pendingCount = () => api.get('/admin/pending-count').then((r) => r.data.data.pendingReviews);

// Revisions (corrections)
export const listRevisions = (id) => api.get(`/notices/${id}/revisions`).then((r) => r.data.data);
export const createRevision = (id, body) => api.post(`/notices/${id}/revisions`, body).then((r) => r.data);
export const revisionDiff = (id, revId) => api.get(`/notices/${id}/revisions/${revId}/diff`).then((r) => r.data.data);
export const approveRevision = (id, revId) => api.post(`/notices/${id}/revisions/${revId}/approve`, {}).then((r) => r.data);
export const rejectRevision = (id, revId, reason) => api.post(`/notices/${id}/revisions/${revId}/reject`, { reason }).then((r) => r.data);

// Attachments (through the gateway boundary)
export function uploadAttachment(file) {
  const form = new FormData();
  form.append('file', file);
  return api.post('/attachments', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data);
}
