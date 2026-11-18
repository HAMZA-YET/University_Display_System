'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const User = require('../../src/modules/users/user.model');
const clock = require('../../src/utils/clock');

const PASSWORD = 'Passw0rd123';

let counter = 0;

async function createUser(role, overrides = {}) {
  counter += 1;
  const email = overrides.email || `${role.toLowerCase()}${counter}@kdu-uids.test`;
  const user = await User.create({
    name: overrides.name || `${role} User ${counter}`,
    email,
    passwordHash: await bcrypt.hash(overrides.password || PASSWORD, 4),
    role,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
  });
  return user.toObject();
}

/** Returns a supertest agent that holds the login cookie. */
async function loginAs(app, user, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

async function createUserAndLogin(app, role, overrides) {
  const user = await createUser(role, overrides);
  const agent = await loginAs(app, user, overrides && overrides.password);
  return { user, agent };
}

/** ISO string with Seoul offset, relative to the controlled clock. */
function iso(date) {
  return new Date(date).toISOString();
}

function inMs(ms) {
  return new Date(clock.now().getTime() + ms);
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function completeNotice(overrides = {}) {
  return {
    title: 'Midterm examination timetable',
    summary: 'The midterm timetable for all departments is now available.',
    body: 'Students must check the room and seat allocation before the exam week begins. Bring your student card.',
    category: 'EXAM',
    department: 'BSC',
    audience: 'STUDENTS',
    visibility: 'PUBLIC',
    publishingOffice: 'Academic Affairs Office',
    contactEmail: 'academic@example.edu',
    requestedPublicationStart: iso(inMs(HOUR)),
    ...overrides,
  };
}

/** Author creates a complete draft and submits it. Returns the notice view. */
async function createSubmitted(authorAgent, overrides) {
  const created = await authorAgent.post('/api/notices').send(completeNotice(overrides));
  if (created.status !== 201) throw new Error(`create failed ${created.status} ${JSON.stringify(created.body)}`);
  const submitted = await authorAgent.post(`/api/notices/${created.body.data.id}/submit`).send({});
  if (submitted.status !== 200) throw new Error(`submit failed ${submitted.status} ${JSON.stringify(submitted.body)}`);
  return submitted.body.data;
}

/** Full flow to a published (or scheduled) notice. */
async function createApproved(authorAgent, reviewerAgent, overrides = {}, approval = { mode: 'NOW' }) {
  const notice = await createSubmitted(authorAgent, overrides);
  const approved = await reviewerAgent.post(`/api/notices/${notice.id}/approve`).send(approval);
  if (approved.status !== 200) throw new Error(`approve failed ${approved.status} ${JSON.stringify(approved.body)}`);
  return approved.body.data;
}

module.exports = {
  PASSWORD,
  HOUR,
  DAY,
  createUser,
  loginAs,
  createUserAndLogin,
  completeNotice,
  createSubmitted,
  createApproved,
  iso,
  inMs,
};
