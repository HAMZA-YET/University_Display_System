import api, { ifMatch } from './client';

const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const listProfessors = (params) => api.get('/professors', { params: clean(params) }).then((r) => r.data);
export const getProfessor = (id) => api.get(`/professors/${id}`).then((r) => r.data.data);
export const professorDepartments = () => api.get('/professors/departments').then((r) => r.data.data);
export const createProfessor = (body) => api.post('/professors', body).then((r) => r.data.data);
export const updateProfessor = (id, body, version) => api.put(`/professors/${id}`, body, ifMatch(version)).then((r) => r.data.data);
export const deleteProfessor = (id) => api.delete(`/professors/${id}`).then((r) => r.data.data);
