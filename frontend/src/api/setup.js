import api, { ApiError } from './client';

export async function getSetupStatus() {
  const response = await api.get('/setup/status');
  const status = response.data?.data;
  if (!status || typeof status.bootstrapConfigured !== 'boolean' || typeof status.administratorExists !== 'boolean') {
    throw new ApiError({ status: 502, code: 'INVALID_SETUP_STATUS', message: 'Administrator setup status could not be verified. Please try again.' });
  }
  return status;
}

export async function createAdministrator(token) {
  const response = await api.post('/setup/administrator', {}, { headers: { 'x-bootstrap-token': token } });
  return response.data.data;
}
