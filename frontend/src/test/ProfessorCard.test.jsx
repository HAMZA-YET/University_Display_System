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
