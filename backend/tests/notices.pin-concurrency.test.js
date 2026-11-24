'use strict';

const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const Notice = require('../src/modules/notices/notice.model');
const transactions = require('../src/utils/transaction');

const ctx = useTestApp();

test('parallel approval and placement on different notices share the final global pin slot', async () => {
  const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
  for (let index = 0; index < 4; index++) {
    await F.createApproved(author.agent, reviewer.agent, { title: `Existing pinned notice ${index}` }, { mode: 'NOW', pinned: true });
  }
  const submitted = await F.createSubmitted(author.agent, { title: 'Concurrent approval candidate' });
  const published = await F.createApproved(author.agent, reviewer.agent, { title: 'Concurrent placement candidate' });

  // Allow unprotected capacity reads to overlap at four; a serialized reader
  // resumes after the bounded wait and the next transaction must see five.
  const countDocuments = Notice.countDocuments.bind(Notice);
  let readers = 0;
  let release;
  const overlap = new Promise(resolve => { release = resolve; });
  const count = jest.spyOn(Notice, 'countDocuments').mockImplementation(filter => {
    const query = countDocuments(filter);
    if (filter && filter.status === 'APPROVED' && filter.pinned === true) {
      const execute = query.exec.bind(query);
      query.exec = async () => {
        const result = await execute();
        if (result === 4) {
          readers++;
          if (readers === 2) release();
          await Promise.race([overlap, new Promise(resolve => setTimeout(resolve, 200))]);
        }
        return result;
      };
    }
    return query;
  });
  const results = await Promise.all([
    reviewer.agent.post(`/api/notices/${submitted.id}/approve`).send({ mode: 'NOW', pinned: true }),
    reviewer.agent.patch(`/api/notices/${published.id}/placement`).set('If-Match', String(published.version)).send({ pinned: true }),
  ]);
  count.mockRestore();
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  expect(results.find(result => result.status === 409).body.error.code).toBe('PIN_LIMIT_REACHED');
  expect(await Notice.countDocuments({ status: 'APPROVED', pinned: true })).toBe(5);
});

test('pinning fails closed without transactions while the submitted notice remains unchanged', async () => {
  const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
  const submitted = await F.createSubmitted(author.agent);
  jest.spyOn(transactions, 'supportsTransactions').mockResolvedValue(false);
  const refused = await reviewer.agent.post(`/api/notices/${submitted.id}/approve`).send({ mode: 'NOW', pinned: true });
  expect(refused.status).toBe(503);
  expect(refused.body.error.code).toBe('PIN_TRANSACTIONS_REQUIRED');
  const stored = await Notice.findById(submitted.id).lean();
  expect(stored.status).toBe('SUBMITTED');
  expect(stored.approvedRevision).toBeNull();
});
