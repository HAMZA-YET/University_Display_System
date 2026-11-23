'use strict';

/** Development-only accounts. Printed at the end of the seed. */
module.exports = [
  { key: 'admin', name: 'Admin Officer', email: 'admin@kdu-uids.test', password: 'Admin@12345', role: 'ADMIN' },
  { key: 'author', name: 'Ara Author', email: 'author@kdu-uids.test', password: 'Author@12345', role: 'AUTHOR', department: 'BSC' },
  { key: 'author2', name: 'Ben Writer', email: 'author2@kdu-uids.test', password: 'Author@12345', role: 'AUTHOR', department: 'AI' },
  { key: 'reviewer', name: 'Rita Reviewer', email: 'reviewer@kdu-uids.test', password: 'Reviewer@12345', role: 'REVIEWER' },
  { key: 'reader', name: 'Riley Reader', email: 'reader@kdu-uids.test', password: 'Reader@12345', role: 'READER' },
  // Lost and found (Member 3): sample students
  { key: 'student1', name: 'Sora Student', email: 'student1@kdu-uids.test', password: 'Student@12345', role: 'READER' },
  { key: 'student2', name: 'Jun Student', email: 'student2@kdu-uids.test', password: 'Student@12345', role: 'READER' },
];
