import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import Login from '../pages/Login';
import AccountSecurity from '../pages/AccountSecurity';
import * as auth from '../api/auth';
import { securityRequest } from '../api/security';
vi.mock('../api/auth', () => ({ login: vi.fn(), me: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('../api/security', () => ({ securityRequest: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const user = { id: 'synthetic-id', name: 'Synthetic Admin', role: 'ADMIN', email: 'admin@example.edu' };
function loginPage() {
  render(<AuthProvider initialUser={null}><MemoryRouter><Routes><Route path="/" element={<Login />} /><Route path="/admin" element={<h1>Admin destination</h1>} /></Routes></MemoryRouter></AuthProvider>);
}
async function enterLogin() {
  const events = userEvent.setup();
  await events.type(screen.getByLabelText(/^Email/), user.email);
  await events.type(screen.getByLabelText(/^Password/), 'SyntheticPassword123');
  await events.click(screen.getByRole('button', { name: 'Log in' }));
  return events;
}
describe('integrated account security screens', () => {
  test('existing non-MFA login keeps the role destination', async () => {
    auth.login.mockResolvedValue(user); loginPage(); await enterLogin();
    expect(await screen.findByText('Admin destination')).toBeInTheDocument();
  });
  test('MFA challenge does not navigate until code verification succeeds', async () => {
    auth.login.mockResolvedValue({ mfaRequired: true }); securityRequest.mockResolvedValue(user);
    loginPage(); const events = await enterLogin();
    expect(await screen.findByText('Verify your sign-in')).toBeInTheDocument();
    expect(screen.queryByText('Admin destination')).not.toBeInTheDocument();
    await events.type(screen.getByLabelText(/^Authentication code/), '123456');
    await events.click(screen.getByRole('button', { name: 'Verify', exact: true }));
    expect(await screen.findByText('Admin destination')).toBeInTheDocument();
    expect(securityRequest).toHaveBeenCalledWith('mfa/verify', { code: '123456' });
  });
  test('failed MFA remains on verification screen', async () => {
    auth.login.mockResolvedValue({ mfaRequired: true }); securityRequest.mockRejectedValue(new Error('Invalid code'));
    loginPage(); const events = await enterLogin();
    await screen.findByText('Verify your sign-in');
    await events.type(screen.getByLabelText(/^Authentication code/), '123456');
    await events.click(screen.getByRole('button', { name: 'Verify', exact: true }));
    expect(await screen.findByText('Invalid code')).toBeInTheDocument();
    expect(screen.queryByText('Admin destination')).not.toBeInTheDocument();
  });
  test('profile form uses the shared client and only submits the name', async () => {
    securityRequest.mockResolvedValue({ enabled: true }); auth.me.mockResolvedValue(user);
    render(<AuthProvider initialUser={user}><MemoryRouter><AccountSecurity /></MemoryRouter></AuthProvider>);
    await screen.findByText('MFA is enabled. Every new login requires a code.');
    const events = userEvent.setup(); const input = screen.getByLabelText(/^Display name/);
    await events.clear(input); await events.type(input, 'Updated Student');
    await events.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Profile updated.')).toBeInTheDocument();
    expect(securityRequest).toHaveBeenCalledWith('profile', { name: 'Updated Student' }, 'patch');
  });
});
