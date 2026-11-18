import api from './client';

export const listDepartments = () => api.get('/departments').then((response) => response.data.data);
export const createDepartment = (body) => api.post('/departments', body).then((response) => response.data.data);
export const updateDepartment = (id, body) => api.patch(`/departments/${id}`, body).then((response) => response.data.data);
export const deleteDepartment = (id) => api.delete(`/departments/${id}`).then((response) => response.data.data);
