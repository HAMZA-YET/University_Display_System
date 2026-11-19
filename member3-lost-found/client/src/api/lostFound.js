import api, { ifMatch } from './client';

const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
const data = (r) => r.data.data;

// Public (Member 4 can reuse these for unified discovery)
export const listPublicItems = (params) => api.get('/public/lost-found/items', { params: clean(params) }).then((r) => r.data);
export const getPublicItem = (id) => api.get(`/public/lost-found/items/${id}`).then(data);

// Reporter
export const createItem = (body) => api.post('/lost-found/items', body).then(data);
export const listMyItems = (params) => api.get('/lost-found/me/items', { params: clean(params) }).then((r) => r.data);
export const getMyItem = (id) => api.get(`/lost-found/me/items/${id}`).then(data);
export const updateMyItem = (id, body, version) => api.patch(`/lost-found/me/items/${id}`, body, ifMatch(version)).then(data);
export const resolveMyItem = (id) => api.post(`/lost-found/me/items/${id}/resolve`).then(data);
export const deleteMyItem = (id) => api.delete(`/lost-found/me/items/${id}`).then(data);

// Claimant (found items only)
export const submitClaim = (itemId, evidenceText) => api.post(`/lost-found/items/${itemId}/claims`, { evidenceText }).then(data);
export const listMyClaims = (params) => api.get('/lost-found/me/claims', { params: clean(params) }).then((r) => r.data);
export const getMyClaim = (id) => api.get(`/lost-found/me/claims/${id}`).then(data);
export const deleteMyClaim = (id) => api.delete(`/lost-found/me/claims/${id}`).then(data);

// 5-second notices (each returned once)
export const takeMyNotices = () => api.get('/lost-found/me/notices').then(data);

// Photos
export const publicPhotoUrl = (itemId, photoId) => `${api.defaults.baseURL}/public/lost-found/items/${itemId}/photos/${photoId}`;
export const privatePhotoUrl = (itemId, photoId) => `${api.defaults.baseURL}/lost-found/items/${itemId}/photos/${photoId}`;
export const uploadPhoto = (itemId, file) => {
  const form = new FormData();
  form.append('photo', file);
  return api.post(`/lost-found/me/items/${itemId}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(data);
};
export const removePhoto = (itemId, photoId) => api.delete(`/lost-found/me/items/${itemId}/photos/${photoId}`).then(data);

// Admin
export const adminStats = () => api.get('/lost-found/admin/stats').then(data);
export const adminListItems = (params) => api.get('/lost-found/admin/items', { params: clean(params) }).then((r) => r.data);
export const adminGetItem = (id) => api.get(`/lost-found/admin/items/${id}`).then(data);
export const adminDeleteItem = (id) => api.delete(`/lost-found/admin/items/${id}`).then(data);
export const adminClaimsByItem = (status) => api.get('/lost-found/admin/claims', { params: clean({ status }) }).then((r) => r.data);
export const adminDecide = (id, body) => api.post(`/lost-found/admin/claims/${id}/decision`, body).then(data);
export const adminRelease = (id, note) => api.post(`/lost-found/admin/claims/${id}/release`, { note }).then(data);
export const adminHandover = (id, body) => api.post(`/lost-found/admin/claims/${id}/handover`, body).then(data);
export const adminDeleteClaim = (id) => api.delete(`/lost-found/admin/claims/${id}`).then(data);
