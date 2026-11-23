'use strict';
const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const clock = require('../src/utils/clock');
const Notice = require('../src/modules/notices/notice.model');
const { Bookmark, Follow, Delivery } = require('../src/modules/member-tools/memberTools.models');
const ctx = useTestApp();
const base = '/api/member-tools';
async function actors() {
  clock.set(new Date('2026-11-18T00:00:00Z'));
  const a = await F.createUserAndLogin(ctx.app, 'READER');
  const b = await F.createUserAndLogin(ctx.app, 'READER');
  const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
  return { a, b, author, reviewer };
}
async function subscribe(agent, kind = 'category', target = 'EXAM') {
  const response = await agent.post(`${base}/follows`).send({ kind, target });
  expect(response.status).toBe(200);
  return response.body.data;
}
async function publish({ author, reviewer }, overrides) {
  clock.advance(1000);
  return F.createApproved(author.agent, reviewer.agent, overrides);
}

describe('Account-linked member tools', () => {
  test('MFA challenge cannot access member tools; verified sessions work and copied logout tokens are revoked', async () => {
    const previousKey = process.env.MFA_ENCRYPTION_KEY;
    process.env.MFA_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');
    try {
      const OTPAuth = require('otpauth');
      const u = await actors();
      await subscribe(u.a.agent);
      const n = await publish(u);
      const enrolled = await u.a.agent.post('/api/security/mfa/enroll').send({ password: F.PASSWORD });
      expect(enrolled.status).toBe(200);
      const code = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(enrolled.body.data.secret), period: 30, digits: 6 }).generate({ timestamp: clock.now().getTime() });
      expect((await u.a.agent.post('/api/security/mfa/confirm').send({ code: code() })).status).toBe(200);
      const agent = request.agent(ctx.app);
      const login = await agent.post('/api/auth/login').send({ email: u.a.user.email, password: F.PASSWORD });
      expect(login.body.data).toEqual({ mfaRequired: true });
      for (const path of ['bookmarks', 'follows', 'preferences', 'inbox']) {
        expect((await agent.get(`${base}/${path}`)).status).toBe(401);
      }
      clock.advance(31000);
      const verified = await agent.post('/api/security/mfa/verify').send({ code: code() });
      expect(verified.status).toBe(200);
      const copiedCookie = verified.headers['set-cookie'].find((value) => value.startsWith('uids_token=')).split(';')[0];
      expect((await agent.put(`${base}/bookmarks/${n.id}`).send({})).status).toBe(200);
      expect((await agent.get(`${base}/bookmarks`)).body.meta.total).toBe(1);
      expect((await agent.get(`${base}/inbox`)).body.meta.total).toBe(1);
      expect((await u.b.agent.get(`${base}/bookmarks`)).body.meta.total).toBe(0);
      expect((await agent.post('/api/auth/logout')).status).toBe(200);
      for (const path of ['bookmarks', 'follows', 'preferences', 'inbox']) {
        expect((await request(ctx.app).get(`${base}/${path}`).set('Cookie', copiedCookie)).status).toBe(401);
      }
      expect((await u.b.agent.get(`${base}/preferences`)).status).toBe(200);
    } finally {
      if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
      else process.env.MFA_ENCRYPTION_KEY = previousKey;
    }
  });

  test('unfollow stops future deliveries without deleting history or another account follow', async () => {
    const u = await actors();
    const follows = await subscribe(u.a.agent);
    await subscribe(u.b.agent);
    await publish(u);
    expect((await u.a.agent.get(`${base}/inbox`)).body.meta.total).toBe(1);
    expect((await u.a.agent.delete(`${base}/follows/${follows[0].id}`)).status).toBe(200);
    expect((await u.a.agent.get(`${base}/follows`)).body.data).toEqual([]);
    expect((await u.b.agent.get(`${base}/follows`)).body.data).toHaveLength(1);
    await publish(u, { title: '[Sample] Publication after unfollow' });
    expect((await u.a.agent.get(`${base}/inbox`)).body.meta.total).toBe(1);
    expect((await u.b.agent.get(`${base}/inbox`)).body.meta.total).toBe(2);
  });

  test('scheduled delivery retries deduplicate and withdrawal hides the scheduled source everywhere', async () => {
    const u = await actors();
    await subscribe(u.a.agent);
    const starts = F.inMs(F.HOUR);
    const n = await F.createApproved(u.author.agent, u.reviewer.agent, {}, { mode: 'SCHEDULE', publicationStart: starts.toISOString() });
    expect((await u.a.agent.get(`${base}/inbox`)).body.meta.total).toBe(0);
    clock.set(starts);
    const first = (await u.a.agent.get(`${base}/inbox`)).body;
    expect(first.meta.unread).toBe(1);
    expect((await u.a.agent.get(`${base}/inbox`)).body.data.map((row) => row.id)).toEqual(first.data.map((row) => row.id));
    await u.a.agent.put(`${base}/bookmarks/${n.id}`).send({});
    await Notice.updateOne({ _id: n.id }, { $set: { status: 'WITHDRAWN', 'publicSearch.title': 'PRIVATE-SCHEDULED-SENTINEL' } });
    const inbox = (await u.a.agent.get(`${base}/inbox`)).body;
    expect(inbox.meta.unread).toBe(0);
    expect(inbox.data[0].notice).toBeNull();
    expect(JSON.stringify(inbox)).not.toContain('PRIVATE-SCHEDULED-SENTINEL');
    expect((await u.a.agent.get(`${base}/bookmarks`)).body.data[0].notice).toBeNull();
    expect((await u.a.agent.get(`${base}/inbox/${first.data[0].id}/open`)).status).toBe(404);
  });

  test('cookie authentication, strict identity inputs and bookmark isolation/idempotency', async () => {
    const u = await actors();
    const n = await publish(u);
    expect((await request(ctx.app).get(`${base}/bookmarks`)).status).toBe(401);
    expect((await request(ctx.app).get(`${base}/inbox`)).status).toBe(401);
    expect((await u.a.agent.put(`${base}/bookmarks/${n.id}`).send({ owner: u.b.user.id })).status).toBe(400);
    const saves = await Promise.all([u.a.agent.put(`${base}/bookmarks/${n.id}`).send({}), u.a.agent.put(`${base}/bookmarks/${n.id}`).send({})]);
    expect(saves.map((s) => s.status)).toEqual([200, 200]);
    expect(await Bookmark.countDocuments()).toBe(1);
    expect((await u.b.agent.get(`${base}/bookmarks`)).body.data).toEqual([]);
    await u.b.agent.delete(`${base}/bookmarks/${n.id}`);
    const list = await u.a.agent.get(`${base}/bookmarks`);
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].notice.title).toBe(n.title);
    expect((await u.b.agent.get(`${base}/bookmarks/${n.id}`)).body.data.saved).toBe(false);
    expect((await u.a.agent.get(`${base}/bookmarks/${n.id}`)).body.data.saved).toBe(true);
  });
  test('authentic event deliveries deduplicate concurrent reads and preserve each owner read state', async () => {
    const u = await actors();
    await subscribe(u.a.agent);
    await subscribe(u.a.agent, 'department', 'BSC');
    await subscribe(u.a.agent);
    expect(await Follow.countDocuments({ owner: u.a.user._id })).toBe(2);
    const n = await publish(u);
    const reads = await Promise.all([u.a.agent.get(`${base}/inbox`), u.a.agent.get(`${base}/inbox`)]);
    expect(reads.every((r) => r.status === 200)).toBe(true);
    expect(await Delivery.countDocuments()).toBe(1);
    const inbox = reads[0].body;
    expect(inbox.meta.unread).toBe(1);
    expect(inbox.data[0].notice.id).toBe(n.id);
    const id = inbox.data[0].id;
    expect((await u.b.agent.patch(`${base}/inbox/${id}`).send({ read: true })).status).toBe(404);
    expect((await u.b.agent.get(`${base}/inbox/${id}/open`)).status).toBe(404);
    expect((await u.b.agent.get(`${base}/inbox`)).body.data).toEqual([]);
    expect((await u.a.agent.get(`${base}/inbox/${id}/open`)).body.data.href).toBe(`/notices/${n.id}`);
    expect((await u.a.agent.patch(`${base}/inbox/${id}`).send({ read: true })).body.data.unread).toBe(0);
    expect((await u.a.agent.get(`${base}/inbox`)).body.data[0].read).toBe(true);
    expect((await u.a.agent.patch(`${base}/inbox/${id}`).send({ read: false })).body.data.unread).toBe(1);
    await u.b.agent.post(`${base}/inbox/read-all`).send({});
    expect((await u.a.agent.get(`${base}/inbox`)).body.meta.unread).toBe(1);
    await u.a.agent.post(`${base}/inbox/read-all`).send({});
    expect((await u.a.agent.get(`${base}/inbox`)).body.meta.unread).toBe(0);
  });
  test('withdrawn and restricted sources expose no title, link or unread count', async () => {
    const u = await actors();
    await subscribe(u.a.agent);
    const n = await publish(u);
    await u.a.agent.put(`${base}/bookmarks/${n.id}`).send({});
    const first = await u.a.agent.get(`${base}/inbox`);
    const id = first.body.data[0].id;
    await Notice.updateOne({ _id: n.id }, { $set: { status: 'WITHDRAWN', title: 'Private working title', 'publicSearch.title': 'Revoked source title' } });
    const bookmarks = await u.a.agent.get(`${base}/bookmarks`);
    const inbox = await u.a.agent.get(`${base}/inbox`);
    expect(bookmarks.body.data[0].notice).toBeNull();
    expect(inbox.body.data[0].notice).toBeNull();
    expect(inbox.body.meta.unread).toBe(0);
    expect(JSON.stringify(inbox.body)).not.toMatch(/Private working|Revoked source/);
    expect((await u.a.agent.get(`${base}/inbox/${id}/open`)).status).toBe(404);
    expect((await u.a.agent.put(`${base}/bookmarks/${n.id}`).send({})).status).toBe(404);
    await Notice.updateOne({ _id: n.id }, { $set: { status: 'APPROVED', 'publicSearch.visibility': 'RESTRICTED' } });
    expect((await u.a.agent.get(`${base}/inbox`)).body.data[0].notice).toBeNull();
  });
  test('follows and preferences are isolated; disabled intervals never replay', async () => {
    const u = await actors();
    const follows = await subscribe(u.a.agent);
    expect((await u.b.agent.delete(`${base}/follows/${follows[0].id}`)).status).toBe(404);
    expect((await u.a.agent.patch(`${base}/preferences`).send({ owner: u.b.user.id, inApp: false })).status).toBe(400);
    await u.a.agent.patch(`${base}/preferences`).send({ inApp: false });
    expect((await u.b.agent.get(`${base}/preferences`)).body.data.inApp).toBe(true);
    await publish(u);
    expect((await u.a.agent.get(`${base}/inbox`)).body.data).toEqual([]);
    clock.advance(1000);
    await u.a.agent.patch(`${base}/preferences`).send({ inApp: true });
    expect((await u.a.agent.get(`${base}/inbox`)).body.data).toEqual([]);
    await publish(u, { title: 'A second eligible notice' });
    expect((await u.a.agent.get(`${base}/inbox`)).body.data).toHaveLength(1);
    expect((await u.a.agent.post(`${base}/follows`).send({ kind: 'category', target: 'FAKE' })).status).toBe(400);
    expect((await u.a.agent.post(`${base}/follows`).send({ kind: 'department', target: 'FAKE' })).status).toBe(400);
  });
  test('new follows do not replay old publications; working-copy changes never leak', async () => {
    const u = await actors();
    await publish(u);
    clock.advance(1000);
    await subscribe(u.a.agent);
    expect((await u.a.agent.get(`${base}/inbox`)).body.data).toEqual([]);
    const n = await publish(u, { title: 'Approved public title' });
    await Notice.updateOne({ _id: n.id }, { $set: { title: 'Unapproved working-copy title', summary: 'Private draft summary' } });
    const inbox = await u.a.agent.get(`${base}/inbox`);
    expect(inbox.body.data[0].notice.title).toBe('Approved public title');
    expect(JSON.stringify(inbox.body)).not.toMatch(/Unapproved|Private draft/);
  });
  test('scheduled approvals deliver only at publication start, including later follows before start', async () => {
    const u = await actors();
    const starts = F.inMs(F.HOUR);
    await F.createApproved(u.author.agent, u.reviewer.agent, {}, { mode: 'SCHEDULE', publicationStart: starts.toISOString() });
    clock.advance(1000);
    await subscribe(u.a.agent);
    expect((await u.a.agent.get(`${base}/inbox`)).body.data).toEqual([]);
    clock.set(starts);
    const inbox = await u.a.agent.get(`${base}/inbox`);
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0].type).toBe('NOTICE_SCHEDULED');
    expect(inbox.body.meta.unread).toBe(1);
  });
});
