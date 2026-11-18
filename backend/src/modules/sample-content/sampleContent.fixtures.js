'use strict';

const crypto = require('crypto');
const SOURCE = 'uids-sample-v1';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const key = (type, name) => `${SOURCE}:${type}:${name}`;
const id = (type, name) => crypto.createHash('sha256').update(key(type, name)).digest('hex').slice(0, 24);
const DEPARTMENTS = [
  ['AI', 'Artificial Intelligence'], ['IBA', 'International Business Administration'],
  ['BSC', 'Smart Computing'], ['IHM', 'International Hospitality Management'],
  ['KS', 'Korean Studies'], ['EAP', 'English for Academic Purposes'],
];
const PROFESSORS = [
  ['Ara Kim', 'PROFESSOR', ['Responsible AI', 'Machine Learning'], 'MON'],
  ['Mateo Rivera', 'ASSOCIATE_PROFESSOR', ['Global Marketing', 'Social Enterprise'], 'TUE'],
  ['Nari Park', 'ASSISTANT_PROFESSOR', ['Web Engineering', 'Human Computer Interaction'], 'WED'],
  ['Sofia Chen', 'LECTURER', ['Guest Experience Design', 'Sustainable Hospitality'], 'THU'],
  ['Joon Han', 'ASSOCIATE_PROFESSOR', ['Korean Culture', 'Intercultural Communication'], 'FRI'],
  ['Mina Ellis', 'LECTURER', ['Academic Writing', 'Presentation Skills'], 'MON'],
];
const SPECS = [
  { slug: 'scholarship-clinic', title: 'Global Talent Scholarship application clinic', category: 'SCHOLARSHIP', department: 'IBA', priority: 'URGENT', summary: 'Explore a fictional scholarship checklist, portfolio review and application timeline.', content: 'Prepare a personal statement, a one-page achievement summary and a recent transcript. The sample clinic walks through eligibility checks, clear budgeting and a final document review. Bring questions about your study goals; no real scholarship applications or payments are accepted through this demonstration.', deadline: 14 },
  { slug: 'course-planning', title: 'Your midsemester course planning checklist', category: 'ACADEMIC', department: 'AI', priority: 'HIGH', summary: 'A practical sample plan for checking credits, meeting an adviser and balancing next semester.', content: 'Start by reviewing completed credits and listing the modules required for your next study stage. Compare prerequisites, reserve time for independent study and discuss a balanced timetable with an adviser. This fictional checklist demonstrates how an academic notice can explain the next steps clearly.', deadline: 18 },
  { slug: 'assessment-study', title: 'Assessment week study-room reservations', category: 'EXAM', department: 'BSC', priority: 'HIGH', summary: 'Sample guidance for quiet study spaces, accessible seating and responsible room booking.', content: 'Choose a study session that suits your assessment preparation, keep group-room bookings to two hours and cancel unused reservations promptly. Request an accessible desk or a quiet environment through your normal university support channel. The rooms and booking arrangements shown here are fictional examples.', deadline: 10 },
  { slug: 'applicant-checklist', title: 'International applicant document checklist', category: 'ADMISSION', department: 'IBA', priority: 'NORMAL', summary: 'See an example admissions notice covering document preparation and translation checks.', content: 'Create a checklist for identity documents, academic records, language evidence and certified translations. Confirm that names and dates agree across every document before sending an application through an official admissions channel. This demonstration does not collect documents and does not represent an actual admission offer.', deadline: 28 },
  { slug: 'library-hours', title: 'Library extended study hours and shared-space guide', category: 'ADMINISTRATIVE', department: 'EAP', priority: 'NORMAL', summary: 'A fictional campus service update showing opening-hour information and study etiquette.', content: 'The sample library schedule offers an early study session, an evening collaboration period and a dedicated quiet floor. Keep walkways clear, use headphones and leave shared desks ready for the next student. These opening hours and facilities are illustrative; check your real university channels before travelling.', deadline: null },
  { slug: 'wellbeing-guide', title: 'Campus wellbeing and peer-support guide', category: 'GENERAL', department: 'KS', priority: 'NORMAL', summary: 'Example advice for building a steady study routine and finding everyday campus support.', content: 'Plan short breaks between study blocks, stay connected with classmates and ask for help early when workloads become difficult. A peer study group can make revision more manageable and help new students feel included. The named campus teams in this demonstration are fictional; use your actual university support contacts.', deadline: null },
  { slug: 'ai-showcase', title: 'Applied AI showcase and project demos', category: 'EVENT', department: 'AI', priority: 'HIGH', summary: 'Discover a fictional afternoon of student prototypes, responsible-AI discussions and demonstrations.', content: 'Visit short project demonstrations covering assistive tools, visual computing and responsible data use. Each team explains the problem, the prototype and the limits of its results. This fictional event is designed to demonstrate event details, calendar filtering and saved interests; it is not a real registration invitation.', venue: 'Demo Innovation Hall', room: '201', organizer: 'Demo AI Project Studio' },
  { slug: 'global-careers', title: 'Global careers networking afternoon', category: 'EVENT', department: 'IBA', priority: 'NORMAL', summary: 'A sample networking programme with career conversations, portfolio feedback and small-group practice.', content: 'Try a brief introduction, review a sample project portfolio and discuss how to turn classroom work into clear professional examples. The demonstration includes space for informal questions and a closing reflection. All speakers, partners and venue details are fictional and no employer attendance is implied.', venue: 'Demo Global Forum', room: '102', organizer: 'Demo Careers Collective' },
  { slug: 'campus-app-workshop', title: 'Build your first campus app workshop', category: 'EVENT', department: 'BSC', priority: 'NORMAL', summary: 'A postponed sample workshop demonstrates how revised event dates remain visible to students.', content: 'Sketch a small campus problem, build a simple interface and test it with a partner. The sample session introduces accessible forms, clear navigation and helpful error messages. This is a fictional postponed event: its original and revised times are shown so you can explore the calendar change workflow.', venue: 'Demo Computing Lab', room: '305', organizer: 'Demo Student Developer Guild', state: 'POSTPONED' },
  { slug: 'hospitality-lab', title: 'Hospitality innovation and service lab', category: 'EVENT', department: 'IHM', priority: 'NORMAL', summary: 'Explore a fictional service-design lab focused on welcoming guests and reducing resource waste.', content: 'Map a guest journey, identify confusing moments and prototype a thoughtful improvement using a small team exercise. The demonstration combines service communication with sustainable operations. The lab, facilitators and timings are fictional; no real venue booking or attendance commitment is created.', venue: 'Demo Service Design Studio', room: '110', organizer: 'Demo Hospitality Innovation Group' },
  { slug: 'culture-festival', title: 'Korean culture and conversation festival', category: 'EVENT', department: 'KS', priority: 'NORMAL', summary: 'A cancelled fictional cultural programme demonstrates visible cancellation notices and reasons.', content: 'This sample programme was planned around language exchange, storytelling and student-led cultural activities. It remains visible with a cancellation label so visitors can understand the change without losing the original notice. It is a fictional example; no real campus event has been cancelled by this application.', venue: 'Demo Community Courtyard', room: 'Outdoor', organizer: 'Demo Cultural Exchange Circle', state: 'CANCELLED' },
  { slug: 'writing-studio', title: 'Academic writing and speaking studio', category: 'EVENT', department: 'EAP', priority: 'NORMAL', summary: 'Practise a sample seminar introduction, paragraph structure and constructive peer feedback.', content: 'Bring a short fictional topic, plan a clear paragraph and practise a two-minute explanation with a partner. The demonstration models respectful feedback and useful revision questions. It illustrates an academic-support event without offering a real class place or collecting student work.', venue: 'Demo Learning Commons', room: '204', organizer: 'Demo Academic Skills Studio' },
];

function fixtures(administrator, baseDate) {
  const at = (offset) => new Date(baseDate.getTime() + offset);
  const departments = DEPARTMENTS.map(([code, name], index) => ({ _id: id('department', code), sampleContentKey: key('department', code), code, name: `${name} (Demo)`, displayOrder: index + 1 }));
  const professors = PROFESSORS.map(([name, position, subjects, day], index) => ({
    _id: id('professor', DEPARTMENTS[index][0]), sampleContentKey: key('professor', DEPARTMENTS[index][0]),
    name: `${name} (Demo)`, titlePrefix: 'Dr.', department: DEPARTMENTS[index][0], position,
    officeRoom: String(201 + index), officeBuilding: 'Demo Faculty Commons',
    email: `demo.professor.${index + 1}@uids.example`, phone: null, subjects,
    counsellingHours: [{ day, startTime: '14:00', endTime: '16:00', location: `Demo Room ${201 + index}`, note: 'Fictional consultation hours for demonstration only.' }],
    profileImage: `/assets/avatars/professor-${index + 1}.svg`, isActive: true, version: 1,
  }));
  const notices = SPECS.map((spec, index) => {
    const title = `[Demo] ${spec.title}`;
    const snapshot = {
      title, summary: `Fictional demonstration: ${spec.summary}`, body: `DEMONSTRATION CONTENT — This notice is fictional and was installed by an administrator to preview the university display system. It is not an official university announcement.\n\n${spec.content}\n\nSuggested next steps\n• Read the details and explore the linked calendar where available.\n• Try saving this notice or following its department.\n• Replace this example with verified university information before using it for real communication.`,
      category: spec.category, department: spec.department, audience: 'ALL', visibility: 'PUBLIC',
      publishingOffice: 'Demo Campus Communications', contactEmail: 'demo@uids.example',
      actionDeadline: spec.deadline ? at(spec.deadline * DAY) : null, attachments: [],
    };
    const publicationStart = at(-(index + 1) * HOUR);
    const revisionId = id('revision', spec.slug);
    const notice = {
      _id: id('notice', spec.slug), sampleContentKey: key('notice', spec.slug), ...snapshot,
      author: administrator, reviewer: administrator, status: 'APPROVED', version: 3,
      priority: spec.priority, priorityRank: { NORMAL: 0, HIGH: 1, URGENT: 2 }[spec.priority], pinned: false,
      publicationStart, publicationEnd: at(60 * DAY), requestedPublicationStart: publicationStart,
      requestedPublicationEnd: at(60 * DAY), submittedAt: at(-(index + 2) * HOUR),
      approvedAt: publicationStart, publishedAt: publicationStart,
      approvedRevision: revisionId, approvedVersionNumber: 1, publicSearch: snapshot,
      reviewHistory: [
        { decision: 'SUBMITTED', reviewer: administrator, decidedAt: at(-(index + 2) * HOUR), reason: 'Fictional sample installation.' },
        { decision: 'APPROVED', reviewer: administrator, decidedAt: publicationStart, reason: 'Administrator approved clearly labelled fictional demonstration content.', revisionNumber: 1 },
      ],
    };
    const revision = { _id: revisionId, sampleContentKey: key('revision', spec.slug), notice: notice._id, revisionNumber: 1, kind: 'INITIAL', author: administrator, contentSnapshot: snapshot, reviewDecision: 'APPROVED', reviewedBy: administrator, reviewedAt: publicationStart, approved: true, approvedAt: publicationStart };
    let event = null;
    if (spec.category === 'EVENT') {
      const eventIndex = index - 6;
      const localDay = new Date(baseDate.getTime() + (eventIndex * 2 + 1) * DAY + 9 * HOUR);
      const originalStart = new Date(Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate(), 5)); // 14:00 Asia/Seoul
      const start = spec.state === 'POSTPONED' ? new Date(originalStart.getTime() + DAY) : originalStart;
      event = {
        _id: id('event', spec.slug), sampleContentKey: key('event', spec.slug), notice: notice._id,
        title, start, end: new Date(start.getTime() + 2 * HOUR), timezone: 'Asia/Seoul', allDay: false,
        venue: spec.venue, venueBuilding: spec.venue, venueRoom: spec.room, organizer: spec.organizer,
        state: spec.state || 'SCHEDULED', createdBy: administrator, version: 1,
        cancellationReason: spec.state === 'CANCELLED' ? 'Fictional demo scenario: the sample courtyard is unavailable. No real event was cancelled.' : null,
        postponementReason: spec.state === 'POSTPONED' ? 'Fictional demo scenario: an extra preparation day was added to the sample workshop.' : null,
        scheduleHistory: spec.state === 'POSTPONED' ? [{ previousStart: originalStart, previousEnd: new Date(originalStart.getTime() + 2 * HOUR), changedAt: baseDate, changedBy: administrator, reason: 'Fictional demonstration of a revised schedule.' }] : [],
      };
    }
    return { notice, revision, event };
  });
  return { departments, professors, notices };
}
module.exports = { SOURCE, key, id, fixtures, DEPARTMENTS };
