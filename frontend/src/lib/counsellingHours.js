import { dayName } from './labels';

/** Validate counselling slots before submitting the professor form. */
export function findSlotProblems(slots) {
  const problems = {};
  slots.forEach((s, i) => {
    if (!s.startTime || !s.endTime) problems[i] = 'Start and end time are required';
    else if (s.endTime <= s.startTime) problems[i] = 'End time must be after start time';
  });
  slots.forEach((a, i) => {
    slots.forEach((b, j) => {
      if (j <= i || problems[j]) return;
      if (a.day === b.day && a.startTime < b.endTime && b.startTime < a.endTime) {
        problems[j] = `Overlaps with another ${dayName(a.day)} slot (${a.startTime}-${a.endTime})`;
      }
    });
  });
  return problems;
}

