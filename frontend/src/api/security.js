import client from './client';
export const securityRequest = async (path, data, method = 'post') => {
  const res = await client.request({ url: '/security/' + path, method, data });
  return res.data.data;
};
