import { CATEGORIES } from '../../lib/labels.js';
// Only documented public API contracts are accepted. No fixtures or browser identity.
export const SEARCH_SOURCES = Object.freeze({
  notice: { label: 'Public notices', endpoint: '/public/notices' },
  professor: { label: 'Professor directory', endpoint: '/professors' },
});

export function parseLiveSearch(input = '') {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input);
  const errors = [];
  for (const key of ['source', 'q', 'department', 'page', 'category', 'from', 'to', 'sort']) {
    if (params.getAll(key).length > 1) errors.push(`Use one value for ${key}.`);
  }
  const source = params.get('source') || 'notice';
  const q = (params.get('q') || '').trim();
  const department = (params.get('department') || '').trim().toUpperCase();
  const category = params.get('category') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const sort = params.get('sort') || 'default';
  const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if (category && !CATEGORIES.includes(category)) errors.push('Choose a valid notice category.');
  if (![ 'default', 'newest' ].includes(sort)) errors.push('Choose a supported notice sort order.');
  for (const date of [from, to]) if (date && !validDate(date)) errors.push('Use a valid YYYY-MM-DD publication date.');
  if (from && to && from > to) errors.push('Start date must be on or before end date.');
  if (source === 'professor' && (category || from || to || sort !== 'default')) errors.push('Notice filters are not available for professor search.');
  const rawPage = params.get('page') || '1';
  const page = Number(rawPage);
  if (!Object.hasOwn(SEARCH_SOURCES, source)) errors.push('Choose public notices or the professor directory.');
  if (q.length > 100) errors.push('Search text must be 100 characters or fewer.');
  if (department && !/^[A-Z]{2,10}$/.test(department)) errors.push('Choose a valid department.');
  if (source === 'professor' && department === 'ALL') errors.push('Choose all departments or a specific professor department.');
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page < 1 || page > 1000000) errors.push('Choose a valid result page.');
  return { state: { source, q, department, page, category, from, to, sort }, errors };
}

export function liveSearchParams(state) {
  const params = new URLSearchParams();
  if (state.source && state.source !== 'notice') params.set('source', state.source);
  if (state.q) params.set('q', state.q.trim());
  if (state.department) params.set('department', state.department);
  for (const key of ['category', 'from', 'to']) if (state[key]) params.set(key, state[key]);
  if (state.sort && state.sort !== 'default') params.set('sort', state.sort);
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
  if (state.source === 'notice') {
    if (state.category) params.category = state.category;
    // Inclusive calendar dates in the university timezone; API requires ISO offsets.
    if (state.from) params.from = state.from + 'T00:00:00.000+09:00';
    if (state.to) params.to = state.to + 'T23:59:59.999+09:00';
    if (state.sort !== 'default') params.sort = state.sort;
  }
  const response = await request(SEARCH_SOURCES[state.source].endpoint, { params, signal });
  if (!response || !Array.isArray(response.data) || !response.meta || !Number.isInteger(response.meta.total) || !Number.isInteger(response.meta.totalPages)) {
    throw new Error('The server returned an unexpected search response. Please try again.');
  }
  return { kind: 'results', state, records: response.data, meta: response.meta };
}
