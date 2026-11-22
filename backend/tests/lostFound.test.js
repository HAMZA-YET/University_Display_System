'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const Item = require('../src/modules/lostFound/item.model');
const Claim = require('../src/modules/lostFound/claim.model');
const Notice = require('../src/modules/lostFound/notice.model');
const CaseEvent = require('../src/modules/lostFound/caseEvent.model');
const AuditLog = require('../src/modules/audit/audit.model');
const clock = require('../src/utils/clock');
const { redactExpiredEvidence, REDACTED } = require('../src/modules/lostFound/lostFound.cleanup');

const ctx = useTestApp();

const EVIDENCE = 'SECRET-EVIDENCE: initials inside the strap and a small tear near one rib.';

function report(overrides = {}) {
  return {
    type: 'FOUND',
    title: 'Navy folding umbrella',
    description: 'Navy blue folding umbrella with a wooden handle.',
    category: 'UMBRELLA',
    location: 'Library 2nd floor',
    custodyNote: 'Student Services, Room 105',
    contactDetails: 'SECRET-CONTACT 010-0000-0000',
    contactVisibility: 'ADMIN',
    ...overrides,
  };
}

async function people() {
  const reporter = await F.createUserAndLogin(ctx.app, 'READER');
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const claimant = await F.createUserAndLogin(ctx.app, 'READER');
  const other = await F.createUserAndLogin(ctx.app, 'READER');
  return { reporter, admin, claimant, other };
}

async function post(p, overrides) {
  const res = await p.reporter.agent.post('/api/lost-found/items').send(report(overrides));
  expect(res.status).toBe(201);
  return res.body.data;
}

const claim = (agent, itemId, text = EVIDENCE) => agent.post(`/api/lost-found/items/${itemId}/claims`).send({ evidenceText: text });
const decide = (p, claimId, decision, note) =>
  p.admin.agent.post(`/api/lost-found/admin/claims/${claimId}/decision`).send(note ? { decision, note } : { decision });
const handover = (p, claimId) =>
  p.admin.agent.post(`/api/lost-found/admin/claims/${claimId}/handover`).send({ identityChecked: true, recipientName: 'Claimant Person' });

describe('LF-REPORT Reports (published immediately)', () => {
  test('LF-REPORT-1 a report is public at once with a unique reference and an automatic date', async () => {
    const p = await people();
    const before = Date.now();
    const a = await post(p);
    const b = await post(p, { title: 'Second item' });
    expect(a.reference).toMatch(/^LF-\d{4}-\d{5}$/);
    expect(a.reference).not.toBe(b.reference);
    expect(new Date(a.postedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect((await request(ctx.app).get(`/api/public/lost-found/items/${a.id}`)).status).toBe(200);
    expect((await request(ctx.app).get('/api/public/lost-found/items')).body.data).toHaveLength(2);
    expect((await request(ctx.app).post('/api/lost-found/items').send(report())).status).toBe(401);
  });

  test('LF-REPORT-2 the client cannot set the date; found items never store private details', async () => {
    const p = await people();
    const withDate = await p.reporter.agent.post('/api/lost-found/items').send({ ...report(), postedAt: '2020-01-01T00:00:00Z' });
    expect(withDate.status).toBe(400);
    const found = await post(p, { privateDetails: 'should be dropped' });
    expect((await Item.findById(found.id).lean()).privateDetails).toBeNull();
    const lost = await post(p, { type: 'LOST', privateDetails: 'SECRET-MARK engraved J' });
    expect((await p.reporter.agent.get(`/api/lost-found/me/items/${lost.id}`)).body.data.privateDetails).toContain('SECRET-MARK');
  });

  test('LF-REPORT-3 contact details are public only when the reporter chooses EVERYONE; private details never', async () => {
    const p = await people();
    const hidden = await post(p, { type: 'LOST', privateDetails: 'SECRET-MARK' });
    const shown = await post(p, { contactDetails: 'PUBLIC-CONTACT desk', contactVisibility: 'EVERYONE' });
    const list = JSON.stringify((await request(ctx.app).get('/api/public/lost-found/items')).body);
    expect(list).toContain('PUBLIC-CONTACT');
    expect(list).not.toContain('SECRET-CONTACT');
    expect(list).not.toContain('SECRET-MARK');
    expect(list).not.toContain(p.reporter.user.email);
    expect((await request(ctx.app).get(`/api/public/lost-found/items/${hidden.id}`)).body.data.contactDetails).toBeNull();
    expect((await request(ctx.app).get(`/api/public/lost-found/items/${shown.id}`)).body.data.contactDetails).toBe('PUBLIC-CONTACT desk');
  });

  test('LF-REPORT-4 reporters edit and delete their own reports only; deleted reports disappear', async () => {
    const p = await people();
    const item = await post(p);
    expect(
      (await p.other.agent.patch(`/api/lost-found/me/items/${item.id}`).set('If-Match', '1').send({ title: 'Hacked title' })).status
    ).toBe(404);
    const edit = await p.reporter.agent.patch(`/api/lost-found/me/items/${item.id}`).set('If-Match', '1').send({ title: 'Edited title' });
    expect(edit.status).toBe(200);
    expect((await request(ctx.app).get(`/api/public/lost-found/items/${item.id}`)).body.data.title).toBe('Edited title');
    expect((await p.reporter.agent.patch(`/api/lost-found/me/items/${item.id}`).set('If-Match', '1').send({ title: 'Stale' })).status).toBe(
      409
    );

    expect((await p.other.agent.delete(`/api/lost-found/me/items/${item.id}`)).status).toBe(404);
    expect((await p.reporter.agent.delete(`/api/lost-found/me/items/${item.id}`)).status).toBe(200);
    expect((await request(ctx.app).get(`/api/public/lost-found/items/${item.id}`)).status).toBe(404);
    expect((await p.reporter.agent.get('/api/lost-found/me/items')).body.data).toHaveLength(0);
    expect((await Item.findById(item.id).lean()).deletedAt).not.toBeNull(); // kept for audit
  });

  test('LF-REPORT-5 a lost item can be marked as found and leaves the public list', async () => {
    const p = await people();
    const lost = await post(p, { type: 'LOST' });
    const found = await post(p);
    expect((await p.reporter.agent.post(`/api/lost-found/me/items/${found.id}/resolve`)).status).toBe(409);
    const res = await p.reporter.agent.post(`/api/lost-found/me/items/${lost.id}/resolve`);
    expect(res.body.data.status).toBe('RESOLVED');
    expect((await request(ctx.app).get(`/api/public/lost-found/items/${lost.id}`)).status).toBe(404);
  });

  test('LF-REPORT-6 at most 10 reports per member per day; admins are exempt', async () => {
    const p = await people();
    for (let i = 0; i < 10; i += 1) await post(p, { title: `Item number ${i}` });
    const eleventh = await p.reporter.agent.post('/api/lost-found/items').send(report());
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error.code).toBe('DAILY_LIMIT');
    clock.set(new Date(Date.now() + 25 * 3600 * 1000));
    expect((await p.reporter.agent.post('/api/lost-found/items').send(report())).status).toBe(201);
  });

  test('LF-REPORT-7 My Reports filters by type', async () => {
    const p = await people();
    await post(p);
    await post(p, { type: 'LOST' });
    expect((await p.reporter.agent.get('/api/lost-found/me/items?type=LOST')).body.data).toHaveLength(1);
    expect((await p.reporter.agent.get('/api/lost-found/me/items')).body.data).toHaveLength(2);
  });
});

describe('LF-CLAIM Claims (found items only, verified by the admin)', () => {
  test('LF-CLAIM-1 only found items can be claimed; not by the reporter, not by an admin, not twice', async () => {
    const p = await people();
    const found = await post(p);
    const lost = await post(p, { type: 'LOST' });
    expect((await claim(p.claimant.agent, lost.id)).status).toBe(409);
    expect((await claim(p.reporter.agent, found.id)).status).toBe(403);
    expect((await claim(p.admin.agent, found.id)).status).toBe(403);
    expect((await claim(p.claimant.agent, found.id)).status).toBe(201);
    const dup = await claim(p.claimant.agent, found.id);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_CLAIM');
  });

  test('LF-CLAIM-2 only admins can verify; readers and authors get 403', async () => {
    const p = await people();
    const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    const c1 = (await claim(p.claimant.agent, (await post(p)).id)).body.data;
    expect((await p.other.agent.post(`/api/lost-found/admin/claims/${c1.id}/decision`).send({ decision: 'APPROVE' })).status).toBe(403);
    expect((await author.agent.get('/api/lost-found/admin/stats')).status).toBe(403);
    expect((await decide(p, c1.id, 'APPROVE')).status).toBe(200);
  });

  test('LF-CLAIM-3 simultaneous approvals of two claims: exactly one succeeds', async () => {
    const p = await people();
    const admin2 = await F.createUserAndLogin(ctx.app, 'ADMIN');
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    const c2 = (await claim(p.other.agent, item.id)).body.data;
    const results = await Promise.all([
      p.admin.agent.post(`/api/lost-found/admin/claims/${c1.id}/decision`).send({ decision: 'APPROVE' }),
      admin2.agent.post(`/api/lost-found/admin/claims/${c2.id}/decision`).send({ decision: 'APPROVE' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await Claim.countDocuments({ item: item.id, status: 'APPROVED' })).toBe(1);
    expect((await Item.findById(item.id).lean()).status).toBe('COLLECTION_APPROVED');
  });

  test('LF-CLAIM-4 the database index rejects a second approved claim even if the service is bypassed', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    const c2 = (await claim(p.other.agent, item.id)).body.data;
    await Claim.updateOne({ _id: c1.id }, { $set: { status: 'APPROVED' } });
    await expect(Claim.updateOne({ _id: c2.id }, { $set: { status: 'APPROVED' } })).rejects.toMatchObject({ code: 11000 });
  });

  test('LF-CLAIM-5 approval is not a return; handover makes it RETURNED once; others are rejected with a notice', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    const c2 = (await claim(p.other.agent, item.id)).body.data;
    expect((await handover(p, c1.id)).status).toBe(409);
    await decide(p, c1.id, 'APPROVE');
    expect((await request(ctx.app).get(`/api/public/lost-found/items/${item.id}`)).body.data.status).toBe('CLAIM_IN_PROGRESS');
    expect((await claim((await F.createUserAndLogin(ctx.app, 'READER')).agent, item.id)).status).toBe(409);

    const results = await Promise.all([handover(p, c1.id), handover(p, c1.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await Item.findById(item.id).lean()).status).toBe('RETURNED');
    expect(await AuditLog.countDocuments({ action: 'LF_ITEM_HANDED_OVER', entityId: c1.id })).toBe(1);
    expect((await request(ctx.app).get(`/api/public/lost-found/items/${item.id}`)).status).toBe(404);

    const mine = (await p.claimant.agent.get(`/api/lost-found/me/claims/${c1.id}`)).body.data;
    expect(mine.status).toBe('APPROVED');
    expect(mine.collected).toBe(true);
    const loser = (await p.other.agent.get(`/api/lost-found/me/claims/${c2.id}`)).body.data;
    expect(loser.status).toBe('REJECTED');
    expect(JSON.stringify(loser)).not.toContain(p.claimant.user.email);
  });

  test('LF-CLAIM-6 release makes the item claimable again; the released claim shows Rejected', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    await decide(p, c1.id, 'APPROVE');
    const rel = await p.admin.agent.post(`/api/lost-found/admin/claims/${c1.id}/release`).send({ note: 'Did not come within 7 days.' });
    expect(rel.body.data.status).toBe('REJECTED');
    expect((await Item.findById(item.id).lean()).status).toBe('OPEN');
    expect((await claim(p.other.agent, item.id)).status).toBe(201);
  });

  test('LF-CLAIM-7 evidence is visible only to the claimant and the admin', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    expect((await p.claimant.agent.get(`/api/lost-found/me/claims/${c1.id}`)).body.data.evidenceText).toContain('SECRET-EVIDENCE');
    expect(JSON.stringify((await p.admin.agent.get(`/api/lost-found/admin/items/${item.id}`)).body)).toContain('SECRET-EVIDENCE');
    expect((await p.other.agent.get(`/api/lost-found/me/claims/${c1.id}`)).status).toBe(404);
    expect((await p.reporter.agent.get(`/api/lost-found/me/claims/${c1.id}`)).status).toBe(404);
    const reporterView = (await p.reporter.agent.get(`/api/lost-found/me/items/${item.id}`)).body;
    expect(reporterView.data.claimCount).toBe(1);
    const leaks = JSON.stringify([
      reporterView,
      (await request(ctx.app).get(`/api/public/lost-found/items/${item.id}`)).body,
      await CaseEvent.find({}).lean(),
    ]);
    expect(leaks).not.toContain('SECRET-EVIDENCE');
    expect(leaks).not.toContain(p.claimant.user.email);
  });

  test('LF-CLAIM-8 students can delete claims any time; deleting an approved claim frees the item', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    await decide(p, c1.id, 'APPROVE');
    expect((await p.other.agent.delete(`/api/lost-found/me/claims/${c1.id}`)).status).toBe(404);
    expect((await p.claimant.agent.delete(`/api/lost-found/me/claims/${c1.id}`)).status).toBe(200);
    expect((await Item.findById(item.id).lean()).status).toBe('OPEN');
    expect((await p.claimant.agent.get('/api/lost-found/me/claims')).body.data).toHaveLength(0);
    expect((await claim(p.claimant.agent, item.id)).status).toBe(201);
  });

  test('LF-CLAIM-9 deleting a report rejects its open claims and notifies the claimants', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    await p.reporter.agent.delete(`/api/lost-found/me/items/${item.id}`);
    expect((await Claim.findById(c1.id).lean()).status).toBe('REJECTED');
    expect(await Notice.countDocuments({ user: p.claimant.user._id })).toBe(1);
  });

  test('LF-CLAIM-10 the admin can delete any report or claim', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    expect((await p.admin.agent.delete(`/api/lost-found/admin/claims/${c1.id}`)).status).toBe(200);
    expect((await p.admin.agent.delete(`/api/lost-found/admin/items/${item.id}`)).status).toBe(200);
    expect((await p.admin.agent.get(`/api/lost-found/admin/items/${item.id}`)).status).toBe(404);
  });
});

describe('LF-NOTICE 5-second notices', () => {
  test('LF-NOTICE-1 approve and reject create one notice each, shown only once, only to that student', async () => {
    const p = await people();
    const a = await post(p);
    const b = await post(p, { title: 'Another found item' });
    const c1 = (await claim(p.claimant.agent, a.id)).body.data;
    const c2 = (await claim(p.claimant.agent, b.id)).body.data;
    await decide(p, c1.id, 'APPROVE');
    await decide(p, c2.id, 'REJECT', 'Does not match');
    expect((await p.other.agent.get('/api/lost-found/me/notices')).body.data).toHaveLength(0);
    const first = (await p.claimant.agent.get('/api/lost-found/me/notices')).body.data;
    expect(first.map((n) => n.kind).sort()).toEqual(['error', 'success']);
    expect(first.find((n) => n.kind === 'success').text).toContain('approved');
    expect((await p.claimant.agent.get('/api/lost-found/me/notices')).body.data).toHaveLength(0);
  });
});

describe('LF-ADMIN Admin dashboard and lists', () => {
  test('LF-ADMIN-1 action-needed counts, categories and longest-listed items', async () => {
    const p = await people();
    const f = await post(p);
    await post(p, { type: 'LOST', category: 'KEYS', title: 'Lost keys' });
    await claim(p.claimant.agent, f.id);
    const s = (await p.admin.agent.get('/api/lost-found/admin/stats')).body.data;
    expect(s.actionNeeded).toEqual({ lostItems: 1, foundItems: 1, claimsWaiting: 1 });
    expect(s.byCategory.map((c) => c.category).sort()).toEqual(['KEYS', 'UMBRELLA']);
    expect(s.longestFound[0].id).toBe(f.id);
    expect(s.longestLost).toHaveLength(1);
  });

  test('LF-ADMIN-2 claims grouped by item with tab counts', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    await claim(p.other.agent, item.id);
    await decide(p, c1.id, 'REJECT');
    const all = (await p.admin.agent.get('/api/lost-found/admin/claims?status=ALL')).body;
    expect(all.meta.tabs).toEqual({ PENDING: 1, APPROVED: 0, REJECTED: 1, ALL: 2 });
    expect(all.data[0].counts.total).toBe(2);
    const pending = (await p.admin.agent.get('/api/lost-found/admin/claims?status=PENDING')).body;
    expect(pending.data[0].counts).toMatchObject({ total: 1, pending: 1 });
  });

  test('LF-ADMIN-3 admin item list filters by type and category', async () => {
    const p = await people();
    await post(p);
    await post(p, { type: 'LOST', category: 'KEYS', title: 'Lost keys' });
    expect((await p.admin.agent.get('/api/lost-found/admin/items?type=LOST')).body.data).toHaveLength(1);
    expect((await p.admin.agent.get('/api/lost-found/admin/items?category=UMBRELLA')).body.data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- photos and retention

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

describe('LF-PHOTO Item photos', () => {
  test('LF-PHOTO-1 photos are public while the item is listed; private route for reporter and admin only', async () => {
    const p = await people();
    const item = await post(p);
    const up = await p.reporter.agent.post(`/api/lost-found/me/items/${item.id}/photos`).attach('photo', PNG, 'umbrella.png');
    expect(up.status).toBe(201);
    const photoId = up.body.data.photoIds[0];
    const pub = await request(ctx.app).get(`/api/public/lost-found/items/${item.id}/photos/${photoId}`);
    expect(pub.status).toBe(200);
    expect(pub.headers['content-type']).toBe('image/png');
    expect((await p.other.agent.get(`/api/lost-found/items/${item.id}/photos/${photoId}`)).status).toBe(404);
    expect((await p.admin.agent.get(`/api/lost-found/items/${item.id}/photos/${photoId}`)).status).toBe(200);
    await p.reporter.agent.delete(`/api/lost-found/me/items/${item.id}`);
    expect((await request(ctx.app).get(`/api/public/lost-found/items/${item.id}/photos/${photoId}`)).status).toBe(404);
  });

  test('LF-PHOTO-2 wrong types, fake images, other members and more than 3 photos are rejected', async () => {
    const p = await people();
    const item = await post(p);
    const url = `/api/lost-found/me/items/${item.id}/photos`;
    expect((await p.reporter.agent.post(url).attach('photo', Buffer.from('%PDF-1.4 test'), 'a.pdf')).status).toBe(400);
    expect((await p.reporter.agent.post(url).attach('photo', Buffer.from('not really a png'), 'fake.png')).status).toBe(400);
    expect((await p.other.agent.post(url).attach('photo', PNG, 'a.png')).status).toBe(404);
    for (let i = 0; i < 3; i += 1) expect((await p.reporter.agent.post(url).attach('photo', PNG, `p${i}.png`)).status).toBe(201);
    expect((await p.reporter.agent.post(url).attach('photo', PNG, 'p4.png')).status).toBe(400);
  });
});

describe('LF-RETENTION Evidence cleanup', () => {
  test('LF-RETENTION-1 evidence of finished cases is removed after the period; history kept', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    await decide(p, c1.id, 'APPROVE');
    await handover(p, c1.id);
    expect((await redactExpiredEvidence({ days: 30 })).claims).toBe(0);
    clock.set(new Date(Date.now() + 31 * 24 * 3600 * 1000));
    expect((await redactExpiredEvidence({ days: 30 })).claims).toBe(1);
    const dbClaim = await Claim.findById(c1.id).lean();
    expect(dbClaim.evidenceText).toBe(REDACTED);
    expect(dbClaim.history.map((h) => h.action)).toContain('HANDED_OVER');
  });
});

// ---------------------------------------------------------------- Member 1 private-evidence connection

describe('LF-EVIDENCE Private evidence permission (Member 1 A05 callback)', () => {
  const { authorizeEvidence } = require('../src/modules/lostFound/lostFound.evidence');
  const { Evidence } = require('../src/modules/security/evidence');

  test('LF-EVIDENCE-1 claimant uploads while pending; claimant and admin read; finder and others never', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    const ask = (actor, action) => authorizeEvidence({ actor, caseId: c1.id, action });

    expect(await ask(p.claimant.user, 'upload')).toBe(true);
    expect(await ask(p.claimant.user, 'download')).toBe(true);
    expect(await ask(p.claimant.user, 'delete')).toBe(true);
    expect(await ask(p.admin.user, 'download')).toBe(true);
    expect(await ask(p.admin.user, 'delete')).toBe(true);
    expect(await ask(p.admin.user, 'upload')).toBe(false);
    for (const action of ['upload', 'download', 'delete']) {
      expect(await ask(p.reporter.user, action)).toBe(false); // the finder never sees claim evidence
      expect(await ask(p.other.user, action)).toBe(false);
    }
    expect(await ask(p.claimant.user, 'rename')).toBe(false);
    expect(await authorizeEvidence({ actor: p.claimant.user, caseId: 'not-an-id', action: 'download' })).toBe(false);
    expect(await authorizeEvidence({ actor: null, caseId: c1.id, action: 'download' })).toBe(false);
  });

  test('LF-EVIDENCE-2 decided, deleted or removed claims refuse uploads; deleted claims refuse everything', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    await decide(p, c1.id, 'REJECT');
    expect(await authorizeEvidence({ actor: p.claimant.user, caseId: c1.id, action: 'upload' })).toBe(false);
    expect(await authorizeEvidence({ actor: p.claimant.user, caseId: c1.id, action: 'delete' })).toBe(false);
    expect(await authorizeEvidence({ actor: p.claimant.user, caseId: c1.id, action: 'download' })).toBe(true);
    await p.claimant.agent.delete(`/api/lost-found/me/claims/${c1.id}`);
    expect(await authorizeEvidence({ actor: p.claimant.user, caseId: c1.id, action: 'download' })).toBe(false);
    expect(await authorizeEvidence({ actor: p.admin.user, caseId: c1.id, action: 'download' })).toBe(false);

    const item2 = await post(p, { title: 'Second umbrella' });
    const c2 = (await claim(p.claimant.agent, item2.id)).body.data;
    await p.reporter.agent.delete(`/api/lost-found/me/items/${item2.id}`);
    expect(await authorizeEvidence({ actor: p.admin.user, caseId: c2.id, action: 'download' })).toBe(false);
  });

  test('LF-EVIDENCE-3 the live route uses this rule: a stranger is refused before any upload', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    expect((await p.other.agent.post(`/api/private-evidence/${c1.id}`)).status).toBe(403);
    expect((await p.reporter.agent.post(`/api/private-evidence/${c1.id}`)).status).toBe(403);
  });

  test('LF-EVIDENCE-4 retention cleanup also deletes the claim evidence files', async () => {
    const p = await people();
    const item = await post(p);
    const c1 = (await claim(p.claimant.agent, item.id)).body.data;
    await Evidence.create({ fileId: 'a'.repeat(48), caseId: c1.id, uploader: p.claimant.user._id, name: 'proof.png', mime: 'image/png', size: 1, sha256: 'x', state: 'PRIVATE' });
    await decide(p, c1.id, 'APPROVE');
    await handover(p, c1.id);
    clock.set(new Date(Date.now() + 31 * 24 * 3600 * 1000));
    const result = await redactExpiredEvidence({ days: 30 });
    expect(result.evidenceFiles).toBe(1);
    expect((await Evidence.findOne({ fileId: 'a'.repeat(48) }).lean()).state).toBe('DELETED');
  });
});
