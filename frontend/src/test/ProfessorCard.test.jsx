import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import ProfessorCard from '../components/professors/ProfessorCard';

test('illustrated profiles fall back to initials and retry when their image changes', () => {
  const professor = { id: 'profile', name: 'Professor Example (Demo)', position: 'PROFESSOR', department: 'ENG', officeRoom: '101', officeBuilding: 'Sample Hall', email: 'fictional@example.invalid', subjects: [], counsellingHours: [], profileImage: '/assets/avatars/professor-1.svg' };
  const { rerender } = render(<ProfessorCard professor={professor} />);
  fireEvent.error(screen.getByAltText('Illustration for Professor Example (Demo)'));
  expect(screen.getByRole('img', { name: 'Initials of Professor Example (Demo)' })).toBeInTheDocument();
  rerender(<ProfessorCard professor={{ ...professor, profileImage: '/assets/avatars/professor-2.svg' }} />);
  expect(screen.getByAltText('Illustration for Professor Example (Demo)')).toHaveAttribute('src', '/assets/avatars/professor-2.svg');
});

test('official profiles show only published details and keep portraits with their source names', () => {
  const professor = { id: 'sourced', name: 'Faculty Fixture', position: 'ASSISTANT_PROFESSOR', positionLabel: 'Assistant Professor', department: null, officeRoom: null, officeBuilding: null, email: null, subjects: [], counsellingHours: [], sourceKey: 'kdu-global:fixture', sourceUrl: 'https://www.kduniv.ac.kr/global/CMS/Contents/Contents.do?mCode=MN090', profileImage: '/assets/kdu/faculty/fixture.jpg', roles: ['Head of Example Programme', 'Assistant Professor'], qualifications: ['PhD Candidate (Computer Science)'] };
  render(<ProfessorCard professor={professor} />);
  expect(screen.getByRole('img', { name: 'Photo of Faculty Fixture' })).toHaveAttribute('src', professor.profileImage);
  expect(screen.getByText('Head of Example Programme')).toBeInTheDocument();
  expect(screen.getByText('PhD Candidate (Computer Science)')).toBeInTheDocument();
  expect(screen.getByText('Not published', { exact: true })).toBeInTheDocument();
  expect(screen.queryByText('By appointment only.')).not.toBeInTheDocument();
  expect(screen.getByText('Office and counselling details are not published.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Official faculty profile/ })).toHaveAttribute('href', professor.sourceUrl);
  expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
});
