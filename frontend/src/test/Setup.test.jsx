import { useState } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import api from '../api/client';
import Setup from '../pages/Setup';
import App from '../App';

const reader = { id: 'account-1', name: 'Project Owner', email: 'owner@example.edu', role: 'READER' };
const enabled = { bootstrapConfigured: true, administratorExists: false };

function SetupWithMemory() {
  const [token, setToken] = useState('');
  return <Setup token={token} onTokenChange={setToken} />;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.hash}</output>;
}

function renderSetup(user = reader) {
  return render(
    <AuthProvider initialUser={user}>
      <MemoryRouter initialEntries={['/setup#token=one-use-secret']}>
        <Routes>
          <Route path="/setup" element={<SetupWithMemory />} />
          <Route path="/admin" element={<h1>Administration ready</h1>} />
          <Route path="/login" element={<h1>Account sign in</h1>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('first administrator setup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: enabled } });
    vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { ...reader, role: 'ADMIN' } } });
  });

  test('requires an account and removes the token from the URL without submitting it', async () => {
    renderSetup(null);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/setup$/));
    expect(screen.queryByRole('button', { name: 'Make my account administrator' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('promotes the displayed signed-in account only after an explicit click', async () => {
    renderSetup();
    const action = await screen.findByRole('button', { name: 'Make my account administrator' });
    expect(screen.getByText('owner@example.edu')).toBeInTheDocument();
    expect(screen.getByText('Project Owner')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Setup token/)).toHaveValue('one-use-secret');
    expect(api.post).not.toHaveBeenCalled();
    await userEvent.click(action);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/setup/administrator', {}, { headers: { 'x-bootstrap-token': 'one-use-secret' } }));
    expect(await screen.findByText('Administration ready')).toBeInTheDocument();
  });

  test('fails closed when setup status is missing', async () => {
    api.get.mockResolvedValue({ data: {} });
    renderSetup();
    expect(await screen.findByText('Setup status unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make my account administrator' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('does not offer promotion once an administrator exists', async () => {
    api.get.mockResolvedValue({ data: { data: { bootstrapConfigured: false, administratorExists: true } } });
    renderSetup();
    expect(await screen.findByText('Administrator setup is complete')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Setup token/)).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('keeps the token in memory while the owner signs in and returns to setup', async () => {
    api.post.mockImplementation(async (url) => ({ data: { data: url === '/auth/login' ? reader : { ...reader, role: 'ADMIN' } } }));
    render(
      <AuthProvider initialUser={null}>
        <MemoryRouter initialEntries={['/setup#token=one-use-secret']}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    );
    await userEvent.click(await screen.findByRole('link', { name: 'Sign in' }));
    await userEvent.type(screen.getByLabelText(/^Email/), reader.email);
    await userEvent.type(screen.getByLabelText(/^Password/), 'owner-test-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('button', { name: 'Make my account administrator' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Setup token/)).toHaveValue('one-use-secret');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe('/auth/login');
  });
});
