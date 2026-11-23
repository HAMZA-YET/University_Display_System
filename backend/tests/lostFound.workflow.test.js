'use strict';

const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const Item = require('../src/modules/lostFound/item.model');
const Claim = require('../src/modules/lostFound/claim.model');
const Counter = require('../src/modules/lostFound/counter.model');
const Notice = require('../src/modules/lostFound/notice.model');
const CaseEvent = require('../src/modules/lostFound/caseEvent.model');
const { Evidence } = require('../src/modules/security/evidence');
const { runCleanup, REDACTED } = require('../src/modules/lostFound/lostFound.cleanup');
const transactions = require('../src/utils/transaction');
const clock = require('../src/utils/clock');

const ctx = useTestApp();
const PROOF = 'The initials inside the umbrella strap identify the owner.';
const DAY = 24 * 60 * 60 * 1000;
const report = (overrides = {}) => ({
  type: 'FOUND', title: 'Found blue umbrella', description: 'Blue folding umbrella with a wooden handle.',
  category: 'UMBRELLA', location: 'Library front desk', contactVisibility: 'ADMIN', ...overrides,
});
async function people() {
  return {
    reporter: await F.createUserAndLogin(ctx.app, 'READER'),
    claimant: await F.createUserAndLogin(ctx.app, 'READER'),
    other: await F.createUserAndLogin(ctx.app, 'READER'),
    admin: await F.createUserAndLogin(ctx.app, 'ADMIN'),
  };
}
async function post(p, overrides) {
  const res = await p.reporter.agent.post('/api/lost-found/items').send(report(overrides));
  expect(res.status).toBe(201);
  return res.body.data;
}
async function claim(p, item, person = p.claimant) {
  const res = await person.agent.post(`/api/lost-found/items/${item.id}/claims`).send({ evidenceText: PROOF });
  expect(res.status).toBe(201);
  return res.body.data;
}
const decide = (p, id, decision, note) => p.admin.agent.post(`/api/lost-found/admin/claims/${id}/decision`).send({ decision, ...(note ? { note } : {}) });
const handover = (p, id) => p.admin.agent.post(`/api/lost-found/admin/claims/${id}/handover`).send({ identityChecked: true, recipientName: 'Synthetic Collector' });

// Pause a real database read to exercise a specific interleaving. Every write
// and transaction still executes against the disposable MongoDB replica set.
async function interleaveAfterRead(model, matches, start, interleave) {
  const originalFind = model.findOne.bind(model);
  let paused = false, signal, release, timer;
  const reached = new Promise(resolve => { signal = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  jest.spyOn(model, 'findOne').mockImplementation((...args) => {
    const query = originalFind(...args);
    if (!paused && matches(args[0])) {
      paused = true;
      const originalLean = query.lean.bind(query);
      query.lean = (...leanArgs) => Promise.resolve(originalLean(...leanArgs)).then(async row => {
        signal();
        await gate;
        return row;
      });
    }
    return query;
  });
  const pending = Promise.resolve(start()).then(value => ({ value }), error => ({ error }));
  let other, failure;
  try {
    await Promise.race([reached, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The expected database read did not occur.')), 5000);
    })]);
    clearTimeout(timer);
    other = await interleave();
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(timer);
    release();
  }
  const result = await pending;
  if (failure) throw failure;
  if (result.error) throw result.error;
  return { first: result.value, other };
}

test('maximum-length custody and decision notes do not block approval, release or rejection', async () => {
  const p = await people();
  const item = await post(p, { title: 'U'.repeat(120), custodyNote: 'C'.repeat(300) });
  const first = await claim(p, item);
  const approval = 'A'.repeat(1000), release = 'R'.repeat(1000), rejection = 'J'.repeat(1000);
  expect((await decide(p, first.id, 'APPROVE', approval)).status).toBe(200);
  expect((await Claim.findById(first.id).lean()).decisionNote).toBe(approval);
  expect((await p.admin.agent.post(`/api/lost-found/admin/claims/${first.id}/release`).send({ note: release })).status).toBe(200);
  expect((await Claim.findById(first.id).lean()).decisionNote).toBe(release);
  const second = await claim(p, item, p.other);
  expect((await decide(p, second.id, 'REJECT', rejection)).status).toBe(200);
  expect((await Claim.findById(second.id).lean()).decisionNote).toBe(rejection);
  const notices = await Notice.find().lean();
  expect(notices).toHaveLength(3);
  expect(notices.every(notice => notice.text.length <= 300 && notice.text.endsWith('…'))).toBe(true);
});

test('two sessions racing for the final rolling-day report slot cannot exceed ten', async () => {
  const reporter = await F.createUserAndLogin(ctx.app, 'READER');
  const secondSession = await F.loginAs(ctx.app, reporter.user);
  await Item.insertMany(Array.from({ length: 9 }, (_, i) => ({
    ...report(), reference: `EXISTING-${i}`, reporter: reporter.user._id, postedAt: clock.now(),
  })));
  const responses = await Promise.all([
    reporter.agent.post('/api/lost-found/items').send(report({ title: 'First competing report' })),
    secondSession.post('/api/lost-found/items').send(report({ title: 'Second competing report' })),
  ]);
  expect(responses.map(res => res.status).sort()).toEqual([201, 429]);
  expect(responses.find(res => res.status === 429).body.error.code).toBe('DAILY_LIMIT');
  expect(await Item.countDocuments({ reporter: reporter.user._id })).toBe(10);
});

test('administrators remain exempt from the rolling report quota', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  await Item.insertMany(Array.from({ length: 10 }, (_, i) => ({
    ...report(), reference: `ADMIN-${i}`, reporter: admin.user._id, postedAt: clock.now(),
  })));
  expect((await admin.agent.post('/api/lost-found/items').send(report())).status).toBe(201);
});

test('report creation refuses unavailable transactions before creating domain or lock records', async () => {
  const reporter = await F.createUserAndLogin(ctx.app, 'READER');
  jest.spyOn(transactions, 'supportsTransactions').mockResolvedValue(false);
  const res = await reporter.agent.post('/api/lost-found/items').send(report());
  expect(res.status).toBe(503);
  expect(res.body.error.code).toBe('LOST_FOUND_TRANSACTIONS_REQUIRED');
  expect(await Item.countDocuments()).toBe(0);
  expect(await Counter.countDocuments()).toBe(0);
});

test('a report deleted after claim intake reads it cannot acquire a late pending claim', async () => {
  const p = await people();
  const item = await post(p);
  const results = await interleaveAfterRead(
    Item, filter => String(filter._id) === item.id && Boolean(filter.status?.$in),
    () => p.claimant.agent.post(`/api/lost-found/items/${item.id}/claims`).send({ evidenceText: PROOF }),
    () => p.reporter.agent.delete(`/api/lost-found/me/items/${item.id}`)
  );
  expect(results.other.status).toBe(200);
  expect([404, 409]).toContain(results.first.status);
  expect(await Claim.countDocuments({ item: item.id, status: 'PENDING' })).toBe(0);
});

test('approval and handover after a claim intake read prevent its late insertion', async () => {
  const p = await people();
  const item = await post(p);
  const ownerClaim = await claim(p, item);
  const results = await interleaveAfterRead(
    Item, filter => String(filter._id) === item.id && Boolean(filter.status?.$in),
    () => p.other.agent.post(`/api/lost-found/items/${item.id}/claims`).send({ evidenceText: PROOF }),
    async () => ({ approval: await decide(p, ownerClaim.id, 'APPROVE'), handover: await handover(p, ownerClaim.id) })
  );
  expect(results.other.approval.status).toBe(200);
  expect(results.other.handover.status).toBe(200);
  expect([404, 409]).toContain(results.first.status);
  expect((await Item.findById(item.id).lean()).status).toBe('RETURNED');
  expect(await Claim.countDocuments({ item: item.id, status: 'PENDING' })).toBe(0);
});

test('deleting a claim after a concurrent handover hides it without withdrawing a completed collection', async () => {
  const p = await people();
  const item = await post(p);
  const ownerClaim = await claim(p, item);
  expect((await decide(p, ownerClaim.id, 'APPROVE')).status).toBe(200);
  const results = await interleaveAfterRead(
    Claim, filter => String(filter._id) === ownerClaim.id,
    () => p.claimant.agent.delete(`/api/lost-found/me/claims/${ownerClaim.id}`),
    () => handover(p, ownerClaim.id)
  );
  expect(results.other.status).toBe(200);
  expect(results.first.status).toBe(200);
  const stored = await Claim.findById(ownerClaim.id).lean();
  expect(stored.status).toBe('APPROVED');
  expect(stored.handover.recipientName).toBe('Synthetic Collector');
  expect(stored.deletedAt).not.toBeNull();
  expect((await Item.findById(item.id).lean()).status).toBe('RETURNED');
  expect(await CaseEvent.countDocuments({ entityId: ownerClaim.id, type: 'LF_CLAIM_WITHDRAWN' })).toBe(0);
});

test('concurrent inbox polls never return the same lost-and-found notice twice', async () => {
  const claimant = await F.createUserAndLogin(ctx.app, 'READER');
  const secondSession = await F.loginAs(ctx.app, claimant.user);
  await Notice.insertMany(Array.from({ length: 13 }, (_, i) => ({ user: claimant.user._id, kind: 'info', text: `Notice ${i}` })));
  const responses = await Promise.all([
    claimant.agent.get('/api/lost-found/me/notices'),
    secondSession.get('/api/lost-found/me/notices'),
  ]);
  expect(responses.every(res => res.status === 200)).toBe(true);
  const ids = responses.flatMap(res => res.body.data.map(notice => notice.id));
  expect(ids).toHaveLength(13);
  expect(new Set(ids).size).toBe(13);
  expect((await claimant.agent.get('/api/lost-found/me/notices')).body.data).toHaveLength(0);
});

test.each([-1, 0, 1.5, Number.NaN, Infinity, 3651])('retention refuses invalid period %s before querying cases', async days => {
  const find = jest.spyOn(Item, 'find');
  await expect(runCleanup({ days })).rejects.toThrow('between 1 and 3650');
  expect(find).not.toHaveBeenCalled();
});

test('invalid configured retention refuses cleanup rather than using an unsafe cutoff', async () => {
  const previous = process.env.LF_EVIDENCE_RETENTION_DAYS;
  process.env.LF_EVIDENCE_RETENTION_DAYS = '-1';
  const find = jest.spyOn(Item, 'find');
  try {
    await expect(runCleanup()).rejects.toThrow('between 1 and 3650');
    expect(find).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.LF_EVIDENCE_RETENTION_DAYS;
    else process.env.LF_EVIDENCE_RETENTION_DAYS = previous;
  }
});

test('retention dry-run preserves proof and files, apply redacts only finished cases, and rerun is safe', async () => {
  clock.set(new Date());
  const p = await people();
  const finishedItem = await post(p);
  const finished = await claim(p, finishedItem);
  const open = await claim(p, await post(p, { title: 'Still open umbrella' }));
  await Evidence.insertMany([
    { fileId: 'a'.repeat(48), caseId: finished.id, uploader: p.claimant.user._id, state: 'PRIVATE', size: 1, sha256: 'fixture' },
    { fileId: 'b'.repeat(48), caseId: open.id, uploader: p.claimant.user._id, state: 'PRIVATE', size: 1, sha256: 'fixture' },
  ]);
  expect((await decide(p, finished.id, 'APPROVE')).status).toBe(200);
  expect((await handover(p, finished.id)).status).toBe(200);
  clock.advance(31 * DAY);
  const dry = await runCleanup({ days: 30, dryRun: true });
  expect(dry).toMatchObject({ dryRun: true, items: 1, claims: 1, evidenceFiles: 1 });
  expect((await Claim.findById(finished.id).lean()).evidenceText).toBe(PROOF);
  expect((await Evidence.findOne({ caseId: finished.id }).lean()).state).toBe('PRIVATE');
  const applied = await runCleanup({ days: 30 });
  expect(applied).toMatchObject({ dryRun: false, claims: 1, evidenceFiles: 1 });
  const closed = await Claim.findById(finished.id).lean();
  expect(closed.evidenceText).toBe(REDACTED);
  expect(closed.history.map(entry => entry.action)).toContain('HANDED_OVER');
  expect((await Evidence.findOne({ caseId: finished.id }).lean()).state).toBe('DELETED');
  expect((await Claim.findById(open.id).lean()).evidenceText).toBe(PROOF);
  expect((await Evidence.findOne({ caseId: open.id }).lean()).state).toBe('PRIVATE');
  expect(await runCleanup({ days: 30 })).toMatchObject({ claims: 0, evidenceFiles: 0 });
});
