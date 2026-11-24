import client from './client';
export const securityRequest = async (path, data, method = 'post') => {
  const res = await client.request({ url: '/security/' + path, method, data });
  return res.data.data;
};

export const evidenceCapabilities = () => client.get('/private-evidence/capabilities').then(res => res.data.data);
export const listEvidence = caseId => client.get(`/private-evidence/${caseId}`).then(res => res.data.data);
export const uploadEvidence = (caseId, file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post(`/private-evidence/${caseId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(res => res.data.data);
};
export const deleteEvidence = (caseId, fileId) => client.delete(`/private-evidence/${caseId}/${fileId}`).then(res => res.data.data);
export const downloadEvidence = (caseId, fileId) => client.get(`/private-evidence/${caseId}/${fileId}`, { responseType: 'blob' }).then(res => res.data);
