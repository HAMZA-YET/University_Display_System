'use strict';
/* eslint-disable no-console */

/**
 * End-to-end smoke test against a RUNNING server that was freshly seeded.
 * Usage: npm run seed && npm run server  (in another terminal)  then
 *        node server/scripts/smoke.js [baseUrl]
 * It walks through the acceptance criteria in Section 21 over real HTTP.
 * It changes data, so run npm run seed again afterwards for a clean demo.
 */
const BASE = process.argv[2] || 'http://localhost:5000';
let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${extra ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ''}`);
  }
}

class Session {
  constructor() {
    this.cookie = '';
  }

  async req(method, path, body, headers = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, body: data, headers: res.headers };
  }

  get(p, h) {
    return this.req('GET', p, undefined, h);
  }
  post(p, b, h) {
    return this.req('POST', p, b === undefined ? {} : b, h);
  }
  patch(p, b, h) {
    return this.req('PATCH', p, b, h);
  }
}

async function login(email, password) {
  const s = new Session();
  const r = await s.post('/api/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status}`);
  return s;
}

const iso = (ms) => new Date(Date.now() + ms).toISOString();
const DAY = 86400000;

async function main() {
  console.log(`Smoke test against ${BASE}`);
  const anon = new Session();

  // 1. Register and log in/out
  const reg = new Session();
  const email = `smoke.${Date.now()}@kdu-uids.test`;
  const r1 = await reg.post('/api/auth/register', { name: 'Smoke Reader', email, password: 'Smoke12345' });
  check('AC1 register creates READER', r1.status === 201 && r1.body.data.role === 'READER', r1.body);
  check('AC1 /me works after register', (await reg.get('/api/auth/me')).status === 200);
  await reg.post('/api/auth/logout');
  check('AC1 logout clears session', (await reg.get('/api/auth/me')).status === 401);

  const author = await login('author@kdu-uids.test', 'Author@12345');
  const author2 = await login('author2@kdu-uids.test', 'Author@12345');
  const reviewer = await login('reviewer@kdu-uids.test', 'Reviewer@12345');
  const reader = await login('reader@kdu-uids.test', 'Reader@12345');
  const admin = await login('admin@kdu-uids.test', 'Admin@12345');
  check('AC2 author logs in', (await author.get('/api/auth/me')).body.data.role === 'AUTHOR');

  // Seeded visibility (AC10, AC11)
  const pubTitles = (await anon.get('/api/public/notices?limit=100')).body.data.map((n) => n.title);
  check('AC10 public list shows seeded published notices', pubTitles.includes('Final examination timetable for all departments'));
  check('AC11 scheduled notice hidden', !pubTitles.includes('Hospitality management industry visit'));
  check('AC11 expired notice hidden', !pubTitles.includes('Course registration period for the spring semester'));
  check('AC10 withdrawn/archived/draft hidden', !pubTitles.some((t) => /Shuttle bus|Orientation week|capstone|Library extended/.test(t)));
  check('AC10 CAMPUS notice hidden from anonymous', !pubTitles.includes('Dormitory fire safety briefing'));
  const readerTitles = (await reader.get('/api/public/notices?limit=100')).body.data.map((n) => n.title);
  check('AC10 CAMPUS notice visible to reader', readerTitles.includes('Dormitory fire safety briefing'));
  check('AC10 first item is the pinned urgent notice', pubTitles[0] === 'Final examination timetable for all departments');

  // 3-5. Create draft, preview, submit with validation
  const d = await author.post('/api/notices', { title: 'Smoke test notice about lab safety' });
  check('AC3 create draft (title only)', d.status === 201 && d.body.data.status === 'DRAFT', d.body);
  const id = d.body.data.id;
  const incomplete = await author.post(`/api/notices/${id}/submit`);
  check('AC5 submit blocked with field list', incomplete.status === 400 && incomplete.body.error.details.length >= 7, incomplete.body);
  const full = await author.patch(
    `/api/notices/${id}`,
    {
      summary: 'Lab safety rules for all computing labs this semester.',
      body: 'Food and drinks are not allowed in the labs. Report damaged equipment to the lab assistant immediately.',
      category: 'ACADEMIC',
      department: 'BSC',
      audience: 'STUDENTS',
      visibility: 'PUBLIC',
      publishingOffice: 'Smart Computing Center',
      requestedPublicationStart: iso(DAY),
    },
    { 'If-Match': '1' }
  );
  check('AC3 save draft with If-Match', full.status === 200 && full.body.data.version === 2, full.body);
  const before = (await author.get(`/api/notices/${id}`)).body.data;
  const prev = await author.get(`/api/notices/${id}/preview`);
  const after = (await author.get(`/api/notices/${id}`)).body.data;
  check('AC4 preview returns public shape', prev.status === 200 && prev.body.data.preview === true);
  check('AC4 preview changes nothing', before.version === after.version && before.updatedAt === after.updatedAt);
  const sub = await author.post(`/api/notices/${id}/submit`);
  check('AC5 submit complete notice', sub.status === 200 && sub.body.data.status === 'SUBMITTED', sub.body);

  // 6-7. Review queue, return, edit, resubmit
  const queue = await reviewer.get('/api/notices/review-queue');
  check('AC6 reviewer sees it in queue', queue.body.data.some((r) => r.noticeId === id));
  const ret = await reviewer.post(`/api/notices/${id}/return`, { reason: 'Please add the lab room numbers to the body.' });
  check('AC7 return with reason', ret.status === 200 && ret.body.data.status === 'RETURNED');
  const seen = (await author.get('/api/notices')).body.data.find((n) => n.id === id);
  check('AC7 author sees reason', seen.lastReview.reason === 'Please add the lab room numbers to the body.');
  const ed = await author.patch(`/api/notices/${id}`, { body: 'Rooms 4A and 4B. Food and drinks are not allowed in the labs.' }, { 'If-Match': String(ret.body.data.version) });
  check('AC7 author edits returned notice (back to DRAFT)', ed.status === 200 && ed.body.data.status === 'DRAFT');
  check('AC7 resubmit', (await author.post(`/api/notices/${id}/submit`)).body.data.status === 'SUBMITTED');

  // 8. Reject a different notice
  const d2 = await author2.post('/api/notices', {
    title: 'Duplicate notice to reject',
    summary: 'This notice duplicates another one already published.',
    body: 'This notice duplicates another one and should be rejected by the reviewer.',
    category: 'GENERAL',
    department: 'AI',
    audience: 'ALL',
    visibility: 'PUBLIC',
    publishingOffice: 'AI Department Office',
    requestedPublicationStart: iso(DAY),
  });
  await author2.post(`/api/notices/${d2.body.data.id}/submit`);
  const rej = await reviewer.post(`/api/notices/${d2.body.data.id}/reject`, { reason: 'Duplicates the notice published last week.' });
  check('AC8 reject with reason', rej.status === 200 && rej.body.data.status === 'REJECTED');

  // 9. Approve now and approve scheduled
  const ap = await reviewer.post(`/api/notices/${id}/approve`, { mode: 'NOW' });
  check('AC9 approve publish now', ap.status === 200 && ap.body.data.effectiveStatus === 'PUBLISHED' && ap.body.domainEvent.type === 'NOTICE_PUBLISHED', ap.body);
  const d3 = await author.post('/api/notices', {
    title: 'Scheduled smoke notice for next week',
    summary: 'This notice is scheduled for the future.',
    body: 'This notice is scheduled and must stay hidden until its start time.',
    category: 'GENERAL',
    department: 'BSC',
    audience: 'ALL',
    visibility: 'PUBLIC',
    publishingOffice: 'Smart Computing Center',
    requestedPublicationStart: iso(7 * DAY),
  });
  await author.post(`/api/notices/${d3.body.data.id}/submit`);
  const sch = await reviewer.post(`/api/notices/${d3.body.data.id}/approve`, { mode: 'SCHEDULE' });
  check('AC9 approve with schedule', sch.status === 200 && sch.body.data.effectiveStatus === 'SCHEDULED', sch.body);
  check('AC11 scheduled notice 404 publicly', (await anon.get(`/api/public/notices/${d3.body.data.id}`)).status === 404);
  check('AC10 approved notice is public', (await anon.get(`/api/public/notices/${id}`)).status === 200);

  // 12-15. Corrections
  const live = (await author.get(`/api/notices/${id}`)).body.data;
  const snap = live.approvedRevision.contentSnapshot;
  const corr = await author.post(`/api/notices/${id}/revisions`, {
    ...snap,
    attachments: [],
    contactEmail: snap.contactEmail || null,
    summary: 'UPDATED lab safety rules for all computing labs this semester.',
    changeNote: 'Clarified that the rules apply to all labs.',
    baseVersion: live.version,
  });
  check('AC12 create correction', corr.status === 201 && corr.body.data.reviewDecision === 'PENDING', corr.body);
  const during = await anon.get(`/api/public/notices/${id}`);
  check('AC13 old version stays public during review', during.body.data.summary === 'Lab safety rules for all computing labs this semester.');
  const diff = await reviewer.get(`/api/notices/${id}/revisions/${corr.body.data.id}/diff`);
  check('AC12 reviewer sees field diff', diff.status === 200 && diff.body.data.fields.find((f) => f.field === 'summary').changed);
  const apc = await reviewer.post(`/api/notices/${id}/revisions/${corr.body.data.id}/approve`, {});
  check('AC14 approve correction', apc.status === 200 && apc.body.domainEvent.type === 'NOTICE_CORRECTED');
  const afterCorr = await anon.get(`/api/public/notices/${id}`);
  check('AC14 new version and Updated date', afterCorr.body.data.summary.startsWith('UPDATED') && Boolean(afterCorr.body.data.updatedAt));
  const live2 = (await author.get(`/api/notices/${id}`)).body.data;
  const corr2 = await author.post(`/api/notices/${id}/revisions`, {
    ...live2.approvedRevision.contentSnapshot,
    attachments: [],
    contactEmail: null,
    title: 'This correction will be rejected',
    changeNote: 'Trying a title change that will be rejected.',
    baseVersion: live2.version,
  });
  await reviewer.post(`/api/notices/${id}/revisions/${corr2.body.data.id}/reject`, { reason: 'The original title is clearer for students.' });
  check('AC15 rejected correction leaves public version', (await anon.get(`/api/public/notices/${id}`)).body.data.title === 'Smoke test notice about lab safety');

  // 16. Concurrency: two authors, same version
  const d4 = await author.post('/api/notices', { title: 'Concurrency demo draft notice' });
  const v = d4.body.data.version;
  const a = await author.patch(`/api/notices/${d4.body.data.id}`, { summary: 'Saved by the first browser.' }, { 'If-Match': String(v) });
  const b = await author.patch(`/api/notices/${d4.body.data.id}`, { summary: 'Saved by the second browser.' }, { 'If-Match': String(v) });
  check('AC16 first save succeeds', a.status === 200);
  check('AC16 second save gets 409 with message', b.status === 409 && b.body.error.message === 'This notice has been modified by another user. Please reload the latest version before saving.' && b.body.error.currentVersion === v + 1, b.body);
  check('AC16 first save content intact', (await author.get(`/api/notices/${d4.body.data.id}`)).body.data.summary === 'Saved by the first browser.');

  // 17. Withdraw: list, detail, search, attachment
  const urgent = (await anon.get('/api/public/notices?q=examination')).body.data.find((n) => n.title.startsWith('Final examination'));
  const fileUrl = urgent && urgent.attachments[0] ? urgent.attachments[0].downloadUrl : null;
  const detailUrgent = (await anon.get(`/api/public/notices/${urgent.id}`)).body.data;
  const dl = await anon.get(detailUrgent.attachments[0].downloadUrl);
  check('AC17 attachment downloads while visible', dl.status === 200 && dl.headers.get('content-type') === 'application/pdf');
  const wd = await reviewer.post(`/api/notices/${urgent.id}/withdraw`, { reason: 'Timetable is being reissued with room changes.' });
  check('AC17 withdraw', wd.status === 200 && wd.body.domainEvent.type === 'NOTICE_WITHDRAWN');
  check('AC17 gone from detail', (await anon.get(`/api/public/notices/${urgent.id}`)).status === 404);
  check('AC17 gone from list', !(await anon.get('/api/public/notices?limit=100')).body.data.some((n) => n.id === urgent.id));
  check('AC17 gone from search', !(await anon.get('/api/public/notices?q=examination')).body.data.some((n) => n.id === urgent.id));
  check('AC17 attachment link refused', (await anon.get(detailUrgent.attachments[0].downloadUrl)).status === 404, fileUrl);

  // 18. Archive the withdrawn notice
  const ar = await reviewer.post(`/api/notices/${urgent.id}/archive`);
  check('AC18 archive withdrawn notice', ar.status === 200 && ar.body.data.status === 'ARCHIVED');

  // 19. Pin and priority change updates public order
  const list0 = (await anon.get('/api/public/notices?limit=100')).body.data;
  const target = list0[list0.length - 1];
  const tv = (await reviewer.get(`/api/notices/${target.id}`)).body.data.version;
  const pl = await reviewer.patch(`/api/notices/${target.id}/placement`, { pinned: true, priority: 'URGENT' }, { 'If-Match': String(tv) });
  check('AC19 placement change', pl.status === 200, pl.body);
  check('AC19 public order updated', (await anon.get('/api/public/notices?limit=100')).body.data[0].id === target.id);

  // 20-22. Events
  const d5 = await author.post('/api/notices', {
    title: 'Smoke hackathon announcement',
    summary: 'A 24-hour hackathon for all students.',
    body: 'Teams of up to four students build a prototype in 24 hours. Mentors are available.',
    category: 'EVENT',
    department: 'BSC',
    audience: 'ALL',
    visibility: 'PUBLIC',
    publishingOffice: 'Smart Computing Center',
    requestedPublicationStart: iso(0),
  });
  const ev = await author.post('/api/events', {
    noticeId: d5.body.data.id,
    start: iso(9 * DAY),
    end: iso(10 * DAY),
    venue: 'Lab 4A',
    organizer: 'Smart Computing Center',
  });
  check('AC20 create event linked to notice', ev.status === 201 && ev.body.data.noticeId === d5.body.data.id, ev.body);
  await author.post(`/api/notices/${d5.body.data.id}/submit`);
  await reviewer.post(`/api/notices/${d5.body.data.id}/approve`, { mode: 'NOW' });
  const pp = await reviewer.post(`/api/events/${ev.body.data.id}/postpone`, { newStart: iso(14 * DAY), newEnd: iso(15 * DAY), reason: 'The lab is booked for exams that week.' });
  const pubEv = (await anon.get(`/api/public/events/${ev.body.data.id}`)).body.data;
  check('AC21 postponed keeps id, shows new and old times and reason', pp.status === 200 && pubEv.id === ev.body.data.id && pubEv.state === 'POSTPONED' && Boolean(pubEv.originalStart) && pubEv.postponementReason === 'The lab is booked for exams that week.');
  const cn = await reviewer.post(`/api/events/${ev.body.data.id}/cancel`, { reason: 'Sponsor withdrew funding for this year.' });
  const pubEv2 = (await anon.get(`/api/public/events/${ev.body.data.id}`)).body.data;
  check('AC22 cancelled shows reason', cn.status === 200 && pubEv2.state === 'CANCELLED' && pubEv2.cancellationReason === 'Sponsor withdrew funding for this year.');

  // 23. List vs calendar range
  const from = new Date(Date.now() - 31 * DAY).toISOString();
  const to = new Date(Date.now() + 31 * DAY).toISOString();
  for (const state of ['UPCOMING', 'COMPLETED', 'CANCELLED', 'POSTPONED']) {
    const listed = (await anon.get(`/api/public/events?state=${state}&limit=100`)).body.data;
    const cal = (await anon.get(`/api/public/events?state=${state}&limit=100&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).body.data;
    const key = (arr) => arr.map((e) => `${e.id}:${e.state}`).sort().join(',');
    check(`AC23 ${state}: list and calendar agree`, key(listed) === key(cal));
  }
  const allEvents = (await anon.get('/api/public/events?limit=100')).body.data;
  check('Seed: resort visit event hidden (scheduled notice)', !allEvents.some((e) => e.title === 'Resort industry visit'));

  // 24. Domain events stable and not duplicated
  const de = await reviewer.get(`/api/domain-events?entityId=${id}`);
  const types = de.body.data.map((e) => e.type);
  check('AC24 domain events recorded', types.includes('NOTICE_PUBLISHED') && types.includes('NOTICE_CORRECTED'));
  const again = await reviewer.post(`/api/notices/${id}/approve`, { mode: 'NOW' });
  const de2 = await reviewer.get(`/api/domain-events?entityId=${id}`);
  check('AC24 repeating approve does not duplicate', again.status === 409 && de2.body.meta.total === de.body.meta.total);

  // 25-27. Professors
  for (const dept of ['AI', 'IBA', 'BSC', 'IHM', 'KS', 'EAP']) {
    const r = await anon.get(`/api/professors?department=${dept}`);
    check(`AC25 professors filter ${dept}`, r.status === 200 && r.body.data.length >= 3 && r.body.data.every((p) => p.department === dept));
  }
  check('AC25 search by name', (await anon.get('/api/professors?q=minjae')).body.data.length === 1);
  check('AC25 search by subject', (await anon.get('/api/professors?q=hospitality%20law')).body.data.length === 1);
  const prof = (await anon.get('/api/professors?q=minjae')).body.data[0];
  check('AC26 office, hours and subjects present', Boolean(prof.officeRoom && prof.officeBuilding && prof.counsellingHours.length && prof.subjects.length));
  const np = await admin.post('/api/professors', {
    name: 'Smoke Professor',
    department: 'BSC',
    position: 'LECTURER',
    officeRoom: '999',
    officeBuilding: 'Test Hall',
    email: `smoke.prof.${Date.now()}@example.edu`,
    subjects: ['Testing', 'testing', 'Quality Assurance'],
    counsellingHours: [{ day: 'MON', startTime: '10:00', endTime: '11:00' }],
  });
  check('AC27 admin adds professor (dedup subjects)', np.status === 201 && np.body.data.subjects.length === 2, np.body);
  const up = await admin.req('PUT', `/api/professors/${np.body.data.id}`, { ...np.body.data, id: undefined, version: undefined, officeRoom: '1000' }, { 'If-Match': '1' });
  check('AC27 admin edits professor', up.status === 200 && up.body.data.officeRoom === '1000', up.body);
  const del = await admin.req('DELETE', `/api/professors/${np.body.data.id}`);
  check('AC27 admin deletes professor', del.status === 200);

  // 30. Reader cannot reach management APIs
  const forbidden = ['/api/notices', '/api/notices/review-queue', '/api/events', '/api/users', '/api/domain-events', '/api/audit-logs', '/api/admin/summary'];
  for (const p of forbidden) check(`AC30 reader blocked from ${p}`, (await reader.get(p)).status === 403);
  check('AC30 anonymous blocked from /api/notices', (await anon.get('/api/notices')).status === 401);

  console.log(`\nSmoke result: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
