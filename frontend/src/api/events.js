import api, { ifMatch } from './client';

const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const listPublicEvents = (params) => api.get('/public/events', { params: clean(params) }).then((r) => r.data);
export const getPublicEvent = (id) => api.get(`/public/events/${id}`).then((r) => r.data.data);

export const listEvents = (params) => api.get('/events', { params: clean(params) }).then((r) => r.data);
export const createEvent = (body) => api.post('/events', body).then((r) => r.data.data);
export const updateEvent = (id, body, version) => api.patch(`/events/${id}`, body, ifMatch(version)).then((r) => r.data.data);
export const deleteEvent = (id) => api.delete(`/events/${id}`).then((r) => r.data.data);
export const postponeEvent = (id, body) => api.post(`/events/${id}/postpone`, body).then((r) => r.data);
export const cancelEvent = (id, reason) => api.post(`/events/${id}/cancel`, { reason }).then((r) => r.data);
