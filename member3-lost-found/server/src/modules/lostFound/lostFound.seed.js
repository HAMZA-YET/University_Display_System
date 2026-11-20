'use strict';

/**
 * Lost-and-found sample data (development only). Called from src/seed/seed.js.
 * Every item, description and piece of "evidence" is synthetic.
 * Dates are consistent: posted -> claimed -> approved -> handed over.
 */
const Item = require('./item.model');
const Claim = require('./claim.model');
const CaseEvent = require('./caseEvent.model');
const Counter = require('./counter.model');
const Notice = require('./notice.model');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const OFFICE = 'Student Services Office (Main Building, Room 105), weekdays 09:00-17:00.';

async function seedLostFound(users) {
  for (const m of [Item, Claim, CaseEvent, Counter, Notice]) {
    await m.deleteMany({});
    await m.syncIndexes();
  }

  const now = Date.now();
  const at = (ms) => new Date(now + ms);
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date(now));
  let seq = 0;
  const admin = users.admin;
  const h = (actor, action, when, note) => ({
    at: when,
    actor: actor ? actor._id : null,
    actorRole: actor ? actor.role : null,
    action,
    note: note || null,
  });

  async function item(reporter, postedAgo, spec, extra = {}) {
    seq += 1;
    const postedAt = at(-postedAgo);
    const { history: more = [], ...rest } = extra;
    return Item.create({
      reference: `LF-${year}-${String(seq).padStart(5, '0')}`,
      reporter: reporter._id,
      postedAt,
      createdAt: postedAt,
      status: 'OPEN',
      contactVisibility: 'ADMIN',
      history: [h(reporter, 'POSTED', postedAt), ...more],
      version: 1 + more.length,
      ...spec,
      ...rest,
    });
  }

  // 1. Found umbrella: two pending claims (competing-claim demo)
  const umbrella = await item(users.reader, 4 * DAY, {
    type: 'FOUND',
    title: 'Navy folding umbrella',
    description: 'Navy blue folding umbrella with a wooden handle, left on a table on the second floor.',
    category: 'UMBRELLA',
    location: 'Library, 2nd floor reading room',
    custodyNote: OFFICE,
    contactDetails: 'reader@kdu-uids.test',
  });
  await Claim.create({
    item: umbrella._id,
    claimant: users.student2._id,
    evidenceText: 'There are initials stitched on the inside of the strap and a small tear near one of the ribs.',
    history: [h(users.student2, 'SUBMITTED', at(-2 * DAY))],
    createdAt: at(-2 * DAY),
  });
  await Claim.create({
    item: umbrella._id,
    claimant: users.student1._id,
    evidenceText: 'I left a navy umbrella in the library last week; it has a wooden handle.',
    history: [h(users.student1, 'SUBMITTED', at(-1 * DAY))],
    createdAt: at(-1 * DAY),
  });

  // 2. Found water bottle, no claims yet (claim demo), contact public
  await item(users.author, 2 * DAY, {
    type: 'FOUND',
    title: 'Blue steel water bottle',
    description: 'Blue insulated steel water bottle with several stickers, found under a seat after a lecture.',
    category: 'WATER_BOTTLE',
    location: 'Innovation Hall, Room 301',
    custodyNote: OFFICE,
    contactDetails: 'Ask at the Innovation Hall front desk',
    contactVisibility: 'EVERYONE',
  });

  // 3. Lost card holder (lost items cannot be claimed), contact public
  await item(users.student1, 1 * DAY, {
    type: 'LOST',
    title: 'Student card holder',
    description: 'Clear plastic card holder on a green lanyard. Contains a student card and a bus card.',
    category: 'WALLET_ID_CARD',
    location: 'Between the cafeteria and the main gate',
    privateDetails: 'The bus card has a cartoon cat sticker.',
    contactDetails: 'student1@kdu-uids.test',
    contactVisibility: 'EVERYONE',
  });

  // 4. Found earbuds case, posted a few hours ago
  await item(users.student1, 5 * HOUR, {
    type: 'FOUND',
    title: 'White wireless earbuds case',
    description: 'White charging case for wireless earbuds (no earbuds inside), found on a bench.',
    category: 'ELECTRONICS',
    location: 'Sports field, east bench',
    custodyNote: OFFICE,
  });

  // 5. Lost keys, contact admin only
  await item(users.student2, 3 * DAY, {
    type: 'LOST',
    title: 'Silver house keys',
    description: 'Two silver keys on a ring with a small torch.',
    category: 'KEYS',
    location: 'Dormitory A entrance',
    privateDetails: 'The torch is engraved with the letter J.',
    contactDetails: '010-0000-0000 (fictional)',
  });

  // 6. Found hoodie: claim APPROVED for student1, waiting for handover; one rejected claim
  const hoodie = await item(
    users.reader,
    6 * DAY,
    {
      type: 'FOUND',
      title: 'Grey hooded sweatshirt',
      description: 'Grey hooded sweatshirt, size M, left in the computer lab after the evening session.',
      category: 'CLOTHING',
      location: 'Computer Lab B, Innovation Hall',
      custodyNote: OFFICE,
    },
    { status: 'COLLECTION_APPROVED', history: [h(admin, 'CLAIM_APPROVED', at(-1 * DAY))] }
  );
  const hoodieClaim = await Claim.create({
    item: hoodie._id,
    claimant: users.student1._id,
    status: 'APPROVED',
    evidenceText: 'There is a faded print on the back and a blue pen mark on the left cuff.',
    decisionNote: 'Details match. Bring your student card.',
    decidedBy: admin._id,
    decidedAt: at(-1 * DAY),
    history: [h(users.student1, 'SUBMITTED', at(-4 * DAY)), h(admin, 'APPROVED', at(-1 * DAY))],
    createdAt: at(-4 * DAY),
    version: 2,
  });
  await Item.updateOne({ _id: hoodie._id }, { $set: { activeClaim: hoodieClaim._id } });
  await Claim.create({
    item: hoodie._id,
    claimant: users.student2._id,
    status: 'REJECTED',
    evidenceText: 'I lost a grey hoodie in the lab last week.',
    decisionNote: 'The description does not match the item.',
    decidedBy: admin._id,
    decidedAt: at(-1 * DAY),
    history: [h(users.student2, 'SUBMITTED', at(-3 * DAY)), h(admin, 'REJECTED', at(-1 * DAY))],
    createdAt: at(-3 * DAY),
    version: 2,
  });

  // 7. Found calculator: completed return (posted 12d, claimed 10d, approved 9d, handed over 8d)
  const calc = await item(
    users.author2,
    12 * DAY,
    {
      type: 'FOUND',
      title: 'Scientific calculator',
      description: 'Black scientific calculator found in the exam hall after the morning exam.',
      category: 'ELECTRONICS',
      location: 'Exam Hall 1',
      custodyNote: OFFICE,
    },
    {
      status: 'RETURNED',
      returnedAt: at(-8 * DAY),
      history: [h(admin, 'CLAIM_APPROVED', at(-9 * DAY)), h(admin, 'HANDED_OVER', at(-8 * DAY))],
    }
  );
  const calcClaim = await Claim.create({
    item: calc._id,
    claimant: users.student2._id,
    status: 'APPROVED',
    evidenceText: 'The label on the back was scratched off and the battery cover is loose.',
    decidedBy: admin._id,
    decidedAt: at(-9 * DAY),
    handover: { at: at(-8 * DAY), admin: admin._id, identityChecked: true, recipientName: 'Jun Student', note: 'Collected at the desk.' },
    history: [h(users.student2, 'SUBMITTED', at(-10 * DAY)), h(admin, 'APPROVED', at(-9 * DAY)), h(admin, 'HANDED_OVER', at(-8 * DAY))],
    createdAt: at(-10 * DAY),
    version: 3,
  });
  await Item.updateOne({ _id: calc._id }, { $set: { activeClaim: calcClaim._id } });

  // 8. Lost backpack the reporter marked as found
  await item(
    users.student1,
    15 * DAY,
    {
      type: 'LOST',
      title: 'Black backpack',
      description: 'Black backpack with a laptop sleeve, possibly left on the shuttle bus.',
      category: 'BAG',
      location: 'Campus shuttle bus',
    },
    { status: 'RESOLVED', resolvedAt: at(-13 * DAY), history: [h(users.student1, 'MARKED_FOUND', at(-13 * DAY))] }
  );

  await Counter.create({ _id: `LF-${year}`, seq });
  return { lostFoundItems: await Item.countDocuments(), lostFoundClaims: await Claim.countDocuments() };
}

module.exports = { seedLostFound };
