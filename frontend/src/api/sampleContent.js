import api, { ApiError } from './client';

function readStatus(response) {
  const data = response.data?.data;
  if (!data || typeof data.installed !== 'boolean' || typeof data.complete !== 'boolean' || !data.counts) {
    throw new ApiError({ status: 502, code: 'INVALID_SAMPLE_STATUS', message: 'Sample content status could not be verified. Please try again.' });
  }
  return data;
}

export const sampleContentStatus = () => api.get('/admin/sample-content').then(readStatus);
export const installSampleContent = () => api.post('/admin/sample-content', {}).then(readStatus);
