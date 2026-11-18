import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import ProtectedRoute from '../components/layout/ProtectedRoute';

function renderAt(path, user) {
  return render(
    <AuthProvider initialUser={user}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/admin" element={<h1>Admin area</h1>} />
          </Route>
          <Route path="/login" element={<h1>Login page</h1>} />
          <Route path="/forbidden" element={<h1>Access denied page</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('FE ProtectedRoute', () => {
  test('FE-6 redirects anonymous users to login', () => {
    renderAt('/admin', null);
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  test('FE-7 redirects users without the right role to the forbidden page', () => {
    renderAt('/admin', { id: 'u1', name: 'Reader', role: 'READER' });
    expect(screen.getByText('Access denied page')).toBeInTheDocument();
    expect(screen.queryByText('Admin area')).not.toBeInTheDocument();
  });

  test('FE-8 renders the page for the right role', () => {
    renderAt('/admin', { id: 'u2', name: 'Admin', role: 'ADMIN' });
    expect(screen.getByText('Admin area')).toBeInTheDocument();
  });
});
