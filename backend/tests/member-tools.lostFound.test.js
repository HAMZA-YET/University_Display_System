'use strict';
const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const clock = require('../src/utils/clock');
const Item = require('../src/modules/lostFound/item.model');
const Claim = require('../src/modules/lostFound/claim.model');
const Professor = require('../src/modules/professors/professor.model');
const Notice = require('../src/modules/notices/notice.model');
const { ItemBookmark, Delivery } = require('../src/modules/member-tools/memberTools.models');
const ctx = useTestApp();
const base = '/api/member-tools';

async function actors() {
  const reporter = await F.createUserAndLogin(ctx.app, 'READER');
  const claimant = await F.createUserAndLogin(ctx.app, 'READER');
  const other = await F.createUserAndLogin(ctx.app, 'READER');
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  clock.set(new Date(Date.now() + 1000));
  return { reporter, claimant, other, admin };
}
async function report(u, title = 'Gamma common umbrella') {
  const result = await u.reporter.agent.post('/api/lost-found/items').send({ type: 'FOUND', title,
    description: 'A navy umbrella with a wooden handle.', category: 'UMBRELLA', location: 'Library',
    custodyNote: 'Student office', contactDetails: 'PRIVATE-CONTACT-SENTINEL', contactVisibility: 'ADMIN' });
  expect(result.status).toBe(201);
  return result.body.data;
}
async function claim(u, item) {
  const result = await u.claimant.agent.post(`/api/lost-found/items/${item.id}/claims`).send({ evidenceText: 'PRIVATE-PROOF-SENTINEL with distinctive personal identifying marks.' });
  expect(result.status).toBe(201);
  return result.body.data;
}
async function approve(u, c) {
  clock.advance(1000);
  const result = await u.admin.agent.post(`/api/lost-found/admin/claims/${c.id}/decision`).send({ decision: 'APPROVE', note: 'PRIVATE-DECISION-SENTINEL' });
  expect(result.status).toBe(200);
}

describe('Lost-and-found discovery and personal tools', () => {
  test('foreign browser origins cannot mutate member tools, including empty-body actions', async () => {
    const u = await actors(); const item = await report(u);
    expect((await u.claimant.agent.put(`${base}/item-bookmarks/${item.id}`).set('Origin', 'https://foreign.example').send({})).status).toBe(403);
    expect((await u.claimant.agent.post(`${base}/inbox/read-all`).set('Origin', 'https://foreign.example').send({})).status).toBe(403);
    expect((await u.claimant.agent.patch(`${base}/preferences`).set('Origin', 'https://foreign.example').send({ inApp: false })).status).toBe(403);
    expect((await u.claimant.agent.get(`${base}/preferences`)).body.data.inApp).toBe(true);
    expect((await u.claimant.agent.put(`${base}/item-bookmarks/${item.id}`).set('Origin', 'http://localhost:5173').send({})).status).toBe(200);
  });

  test('combined notice keywords match approved bodies without exposing working copies or campus bodies', async () => {
    const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
    const reader = await F.createUserAndLogin(ctx.app, 'READER');
    const published = await F.createApproved(author.agent, reviewer.agent, { title: 'Approved public record', summary: 'Approved summary only.', body: 'The approved body contains BODYONLYTOKEN for public discovery.', audience: 'ALL' });
    await Notice.updateOne({ _id: published.id }, { $set: { body: 'A private working copy contains WORKINGONLYTOKEN.' } });
    await F.createApproved(author.agent, reviewer.agent, { title: 'Faculty information', summary: 'Faculty summary only.', body: 'A campus body contains CAMPUSBODYTOKEN.', audience: 'FACULTY', visibility: 'CAMPUS' });
    const approved = await request(ctx.app).get(`${base}/search?q=BODYONLYTOKEN`);
    expect(approved.body.meta.total).toBe(1);
    expect(approved.body.data[0].id).toBe(published.id);
    expect((await request(ctx.app).get(`${base}/search?q=WORKINGONLYTOKEN`)).body.meta.total).toBe(0);
    expect((await request(ctx.app).get(`${base}/search?q=CAMPUSBODYTOKEN`)).body.meta.total).toBe(0);
    expect((await reader.agent.get(`${base}/search?q=CAMPUSBODYTOKEN`)).body.meta.total).toBe(0);
  });

  test('item bookmarks require real identity, deduplicate, isolate owners and hide closed sources', async () => {
    const u = await actors(); const item = await report(u);
    const path = `${base}/item-bookmarks/${item.id}`;
    expect((await request(ctx.app).get(`${base}/item-bookmarks`)).status).toBe(401);
    expect((await request(ctx.app).put(path).send({})).status).toBe(401);
    expect((await u.claimant.agent.put(path).send({ owner: u.other.user.id })).status).toBe(400);
    const saved = await Promise.all([u.claimant.agent.put(path).send({}), u.claimant.agent.put(path).send({})]);
    expect(saved.map(response => response.status)).toEqual([200, 200]);
    expect(await ItemBookmark.countDocuments()).toBe(1);
    expect((await u.other.agent.get(`${base}/item-bookmarks`)).body.meta.total).toBe(0);
    await u.other.agent.delete(path);
    expect((await u.claimant.agent.get(path)).body.data.saved).toBe(true);
    await Item.updateOne({ _id: item.id }, { $set: { status: 'RETURNED', title: 'REVOKED-ITEM-TITLE' } });
    const list = await u.claimant.agent.get(`${base}/item-bookmarks`);
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect(list.body.data[0]).toMatchObject({ available: false, item: null });
    expect(JSON.stringify(list.body)).not.toMatch(/REVOKED|Gamma|PRIVATE-CONTACT/);
    expect((await u.claimant.agent.get(path)).status).toBe(404);
    await u.claimant.agent.delete(path);
    expect((await u.claimant.agent.get(`${base}/item-bookmarks`)).body.meta.total).toBe(0);
  });

  test('combined search has authoritative disjoint pages and omits all lost-and-found metadata for visitors', async () => {
    const u = await actors(); const item = await report(u);
    const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
    await F.createApproved(author.agent, reviewer.agent, { title: 'Alpha common notice', audience: 'ALL' });
    await Professor.create({ name: 'Beta common professor', department: 'AI', position: 'ASSISTANT_PROFESSOR', officeRoom: '101', officeBuilding: 'Main', email: 'professor@example.edu', subjects: [] });
    const guest = await request(ctx.app).get(`${base}/search?q=common&limit=1`);
    expect(guest.status).toBe(200);
    expect(guest.headers['cache-control']).toBe('private, no-store');
    expect(guest.body.meta).toMatchObject({ total: 2, sources: ['notice', 'professor'], counts: { notice: 1, professor: 1 } });
    expect(guest.body.meta.counts).not.toHaveProperty('item');
    expect(JSON.stringify(guest.body)).not.toMatch(/Gamma|lost-found|PRIVATE-CONTACT/);
    expect((await request(ctx.app).get(`${base}/search?q=Gamma`)).body.meta.total).toBe(0);
    const pages = await Promise.all([1, 2, 3].map(page => u.claimant.agent.get(`${base}/search?q=common&limit=1&page=${page}`)));
    expect(pages.every(result => result.status === 200 && result.body.meta.total === 3)).toBe(true);
    const rows = pages.flatMap(result => result.body.data);
    expect(rows.map(row => row.title)).toEqual(['Alpha common notice', 'Beta common professor', 'Gamma common umbrella']);
    expect(new Set(rows.map(row => `${row.source}:${row.id}`)).size).toBe(3);
    expect(JSON.stringify(rows)).not.toMatch(/PRIVATE-CONTACT|evidenceText|contactDetails/);
    await Item.updateOne({ _id: item.id }, { $set: { deletedAt: clock.now() } });
    expect((await u.claimant.agent.get(`${base}/search?q=common`)).body.meta.total).toBe(2);
    expect((await request(ctx.app).get(`${base}/search?owner=spoofed`)).status).toBe(400);
  });

  test('case deliveries are recipient/owner checked, idempotent, private, and revoked when the claim disappears', async () => {
    const u = await actors(); const item = await report(u); const c = await claim(u, item);
    await approve(u, c);
    const replies = await Promise.all([u.claimant.agent.get(`${base}/inbox`), u.claimant.agent.get(`${base}/inbox`)]);
    expect(replies.every(reply => reply.status === 200)).toBe(true);
    expect(await Delivery.countDocuments({ source: 'LOST_FOUND' })).toBe(1);
    const inbox = replies[0].body; const id = inbox.data[0].id;
    expect(inbox.meta.unread).toBe(1);
    expect(inbox.data[0]).toMatchObject({ source: 'LOST_FOUND', type: 'LF_CLAIM_APPROVED', notice: null, available: true });
    expect(inbox.data[0].item.href).toBe(`/items/my-claims/${c.id}`);
    expect(JSON.stringify(inbox)).not.toMatch(/PRIVATE-PROOF|PRIVATE-CONTACT|PRIVATE-DECISION|evidenceText|claimant/);
    expect((await u.other.agent.get(`${base}/inbox`)).body.data).toEqual([]);
    expect((await u.reporter.agent.get(`${base}/inbox`)).body.data).toEqual([]);
    expect((await u.other.agent.get(`${base}/inbox/${id}/open`)).status).toBe(404);
    expect((await u.other.agent.patch(`${base}/inbox/${id}`).send({ read: true })).status).toBe(404);
    expect((await u.claimant.agent.patch(`${base}/inbox/${id}`).send({ read: true })).body.data.unread).toBe(0);
    await u.claimant.agent.patch(`${base}/inbox/${id}`).send({ read: false });
    await Claim.updateOne({ _id: c.id }, { $set: { deletedAt: clock.now() } });
    await Item.updateOne({ _id: item.id }, { $set: { title: 'REVOKED-CASE-TITLE' } });
    const revoked = await u.claimant.agent.get(`${base}/inbox`);
    expect(revoked.body.data[0]).toMatchObject({ available: false, item: null });
    expect(revoked.body.meta.unread).toBe(0);
    expect(JSON.stringify(revoked.body)).not.toMatch(/REVOKED|Gamma|PRIVATE-/);
    expect((await u.claimant.agent.get(`${base}/inbox/${id}/open`)).status).toBe(404);
  });

  test('physical handover delivers separate own-case destinations and deletion revokes both', async () => {
    const u = await actors(); const item = await report(u); const c = await claim(u, item);
    await approve(u, c);
    clock.advance(1000);
    expect((await u.admin.agent.post(`/api/lost-found/admin/claims/${c.id}/handover`).send({ identityChecked: true, recipientName: u.claimant.user.name })).status).toBe(200);
    const claimantInbox = (await u.claimant.agent.get(`${base}/inbox`)).body;
    const reporterInbox = (await u.reporter.agent.get(`${base}/inbox`)).body;
    expect(claimantInbox.data).toHaveLength(2);
    expect(reporterInbox.data).toHaveLength(1);
    expect(reporterInbox.data[0].item.href).toBe(`/items/my-reports/${item.id}`);
    expect(claimantInbox.data.every(row => row.item.href === `/items/my-claims/${c.id}`)).toBe(true);
    expect(JSON.stringify(reporterInbox)).not.toContain(c.id);
    await Item.updateOne({ _id: item.id }, { $set: { deletedAt: clock.now() } });
    expect((await u.claimant.agent.get(`${base}/inbox`)).body.meta.unread).toBe(0);
    expect((await u.reporter.agent.get(`${base}/inbox`)).body.data[0].item).toBeNull();
  });

  test('in-app preferences gate future case delivery independently of notice follows and preserve history', async () => {
    const u = await actors(); const item = await report(u); const c = await claim(u, item);
    await u.claimant.agent.patch(`${base}/preferences`).send({ notices: false });
    await approve(u, c);
    expect((await u.claimant.agent.get(`${base}/inbox`)).body.meta.total).toBe(1);
    await u.claimant.agent.patch(`${base}/preferences`).send({ inApp: false });
    clock.advance(1000);
    expect((await u.admin.agent.post(`/api/lost-found/admin/claims/${c.id}/release`).send({ note: 'Released for a new ownership review.' })).status).toBe(200);
    expect((await u.claimant.agent.get(`${base}/inbox`)).body.meta.total).toBe(1);
    clock.advance(1000);
    await u.claimant.agent.patch(`${base}/preferences`).send({ inApp: true });
    expect((await u.claimant.agent.get(`${base}/inbox`)).body.meta.total).toBe(1);
    const secondItem = await report(u, 'Another eligible umbrella'); const secondClaim = await claim(u, secondItem);
    await approve(u, secondClaim);
    expect((await u.claimant.agent.get(`${base}/inbox`)).body.meta.total).toBe(2);
  });
});
