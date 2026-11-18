// Only documented public API contracts are accepted. No fixtures or browser identity.
export const SEARCH_SOURCES = Object.freeze({
  notice: { label: 'Public notices', endpoint: '/public/notices' },
  professor: { label: 'Professor directory', endpoint: '/professors' },
});

export function parseLiveSearch(input = '') {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input);
  const errors = [];
  for (const key of ['source', 'q', 'department', 'page']) {
    if (params.getAll(key).length > 1) errors.push(`Use one value for ${key}.`);
  }
  const source = params.get('source') || 'notice';
  const q = (params.get('q') || '').trim();
  const department = (params.get('department') || '').trim().toUpperCase();
  const rawPage = params.get('page') || '1';
  const page = Number(rawPage);
  if (!Object.hasOwn(SEARCH_SOURCES, source)) errors.push('Choose public notices or the professor directory.');
  if (q.length > 100) errors.push('Search text must be 100 characters or fewer.');
  if (department && !/^[A-Z]{2,10}$/.test(department)) errors.push('Choose a valid department.');
  if (source === 'professor' && department === 'ALL') errors.push('Choose all departments or a specific professor department.');
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page < 1 || page > 1000000) errors.push('Choose a valid result page.');
  return { state: { source, q, department, page }, errors };
}

export function liveSearchParams(state) {
  const params = new URLSearchParams();
  if (state.source && state.source !== 'notice') params.set('source', state.source);
  if (state.q) params.set('q', state.q.trim());
  if (state.department) params.set('department', state.department);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

export async function searchConnectedRecords(input, { request, signal } = {}) {
  const { state, errors } = parseLiveSearch(input);
  if (errors.length) return { kind: 'invalid', errors, state };
  if (typeof request !== 'function') throw new Error('A connected public API is required.');
  const params = { page: state.page, limit: 12 };
  if (state.q) params.q = state.q;
  if (state.department) params.department = state.department;
  const response = await request(SEARCH_SOURCES[state.source].endpoint, { params, signal });
  if (!response || !Array.isArray(response.data) || !response.meta || !Number.isInteger(response.meta.total) || !Number.isInteger(response.meta.totalPages)) {
    throw new Error('The server returned an unexpected search response. Please try again.');
  }
  return { kind: 'results', state, records: response.data, meta: response.meta };
}
