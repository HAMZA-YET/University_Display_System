'use strict';

/**
 * SAMPLE DATA ONLY. Every name, email and phone number below is fictional.
 * Emails use the reserved example.edu domain. Do not replace these with real
 * professor names or real university contact details.
 */
const slot = (day, startTime, endTime, location, note) => ({ day, startTime, endTime, location: location || null, note: note || null });

module.exports = [
  // Artificial Intelligence (AI)
  { name: 'Minjae Sample', titlePrefix: 'Dr.', department: 'AI', position: 'PROFESSOR', officeRoom: '501', officeBuilding: 'Innovation Hall', email: 'minjae.sample@example.edu', phone: '+82 33 000 1501', subjects: ['Machine Learning', 'Deep Learning', 'Pattern Recognition'], counsellingHours: [slot('MON', '14:00', '16:00', 'Room 501'), slot('THU', '10:00', '11:00', 'Room 501')] },
  { name: 'Sora Placeholder', titlePrefix: 'Dr.', department: 'AI', position: 'ASSOCIATE_PROFESSOR', officeRoom: '503', officeBuilding: 'Innovation Hall', email: 'sora.placeholder@example.edu', subjects: ['Natural Language Processing', 'Python Programming'], counsellingHours: [slot('TUE', '13:00', '15:00')] },
  { name: 'Daniel Fictional', department: 'AI', position: 'ASSISTANT_PROFESSOR', officeRoom: '507', officeBuilding: 'Innovation Hall', email: 'daniel.fictional@example.edu', subjects: ['Computer Vision', 'Linear Algebra for AI', 'Robotics Basics'], counsellingHours: [slot('WED', '09:30', '11:00'), slot('FRI', '14:00', '15:00', 'Online', 'By appointment')] },
  // International Business Administration (IBA)
  { name: 'Hyejin Example', titlePrefix: 'Dr.', department: 'IBA', position: 'PROFESSOR', officeRoom: '302', officeBuilding: 'Global Business Hall', email: 'hyejin.example@example.edu', phone: '+82 33 000 1302', subjects: ['International Marketing', 'Consumer Behaviour'], counsellingHours: [slot('MON', '10:00', '12:00')] },
  { name: 'Omar Testcase', department: 'IBA', position: 'LECTURER', officeRoom: '306', officeBuilding: 'Global Business Hall', email: 'omar.testcase@example.edu', subjects: ['Financial Accounting', 'Business Statistics'], counsellingHours: [slot('TUE', '15:00', '16:30'), slot('THU', '15:00', '16:00')] },
  { name: 'Grace Mockup', titlePrefix: 'Dr.', department: 'IBA', position: 'ASSOCIATE_PROFESSOR', officeRoom: '310', officeBuilding: 'Global Business Hall', email: 'grace.mockup@example.edu', subjects: ['Supply Chain Management', 'Operations Strategy', 'Global Logistics'], counsellingHours: [slot('WED', '13:00', '14:30')] },
  // Bachelor of Smart Computing (BSC)
  { name: 'Jiwoo Dummy', titlePrefix: 'Dr.', department: 'BSC', position: 'PROFESSOR', officeRoom: '401', officeBuilding: 'Smart Computing Center', email: 'jiwoo.dummy@example.edu', phone: '+82 33 000 1401', subjects: ['Web Development', 'Database Systems', 'Software Engineering'], counsellingHours: [slot('MON', '13:00', '15:00', 'Lab 4A'), slot('WED', '10:00', '11:00')] },
  { name: 'Lucas Template', department: 'BSC', position: 'ASSISTANT_PROFESSOR', officeRoom: '405', officeBuilding: 'Smart Computing Center', email: 'lucas.template@example.edu', subjects: ['Internet of Things', 'Embedded Systems'], counsellingHours: [slot('TUE', '10:00', '12:00', 'IoT Lab')] },
  { name: 'Yuna Sample', titlePrefix: 'Dr.', department: 'BSC', position: 'ASSOCIATE_PROFESSOR', officeRoom: '409', officeBuilding: 'Smart Computing Center', email: 'yuna.sample@example.edu', subjects: ['Computer Networks', 'Cybersecurity Fundamentals', 'Operating Systems'], counsellingHours: [slot('THU', '13:30', '15:30'), slot('FRI', '09:00', '10:00')] },
  // International Hospitality Management (IHM)
  { name: 'Eunji Fixture', titlePrefix: 'Dr.', department: 'IHM', position: 'PROFESSOR', officeRoom: '201', officeBuilding: 'Hospitality Hall', email: 'eunji.fixture@example.edu', subjects: ['Hotel Operations', 'Revenue Management'], counsellingHours: [slot('MON', '09:00', '10:30')] },
  { name: 'Marco Stub', department: 'IHM', position: 'LECTURER', officeRoom: '204', officeBuilding: 'Hospitality Hall', email: 'marco.stub@example.edu', subjects: ['Food and Beverage Management', 'Culinary Arts Basics'], counsellingHours: [slot('WED', '14:00', '16:00', 'Training Kitchen')] },
  { name: 'Hana Demo', department: 'IHM', position: 'VISITING_PROFESSOR', officeRoom: '208', officeBuilding: 'Hospitality Hall', email: 'hana.demo@example.edu', subjects: ['Tourism Policy', 'Event Planning', 'Hospitality Law'], counsellingHours: [slot('TUE', '11:00', '12:00'), slot('THU', '11:00', '12:00')] },
  // Korean Studies (KS)
  { name: 'Seojun Mock', titlePrefix: 'Dr.', department: 'KS', position: 'PROFESSOR', officeRoom: '101', officeBuilding: 'Humanities Hall', email: 'seojun.mock@example.edu', subjects: ['Korean Grammar', 'Korean Literature'], counsellingHours: [slot('MON', '15:00', '17:00')] },
  { name: 'Mina Placeholder', department: 'KS', position: 'ASSISTANT_PROFESSOR', officeRoom: '104', officeBuilding: 'Humanities Hall', email: 'mina.placeholder@example.edu', subjects: ['Korean History', 'Korean Culture and Society'], counsellingHours: [slot('WED', '10:00', '12:00'), slot('FRI', '13:00', '14:00')] },
  { name: 'Taeyang Example', department: 'KS', position: 'ADJUNCT', officeRoom: '108', officeBuilding: 'Humanities Hall', email: 'taeyang.example@example.edu', subjects: ['TOPIK Preparation', 'Business Korean'], counsellingHours: [slot('THU', '16:00', '17:00', 'Room 108', 'Drop-in')] },
  // English for Academic Purposes (EAP)
  { name: 'Sarah Sample', department: 'EAP', position: 'LECTURER', officeRoom: '110', officeBuilding: 'Language Center', email: 'sarah.sample@example.edu', subjects: ['Academic Writing', 'Research Skills'], counsellingHours: [slot('MON', '11:00', '12:00'), slot('TUE', '11:00', '12:00')] },
  { name: 'James Fictional', titlePrefix: 'Dr.', department: 'EAP', position: 'ASSOCIATE_PROFESSOR', officeRoom: '112', officeBuilding: 'Language Center', email: 'james.fictional@example.edu', subjects: ['Academic Presentation', 'IELTS Preparation', 'Critical Reading'], counsellingHours: [slot('WED', '15:00', '16:30')] },
  { name: 'Priya Testcase', department: 'EAP', position: 'LECTURER', officeRoom: '115', officeBuilding: 'Language Center', email: 'priya.testcase@example.edu', subjects: ['Listening and Speaking', 'Grammar for Academic English'], counsellingHours: [slot('THU', '09:00', '10:30'), slot('SAT', '10:00', '11:00', 'Online', 'Exam weeks only')] },
];
