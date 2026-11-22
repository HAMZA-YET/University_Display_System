import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import Login from '../pages/Login';
import AccountSecurity from '../pages/AccountSecurity';
import * as auth from '../api/auth';
import { securityRequest } from '../api/security';
vi.mock('../api/auth', () => ({ login: vi.fn(), me: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('../api/security', () => ({ securityRequest: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const user = { id: 'synthetic-id', name: 'Synthetic Admin', role: 'ADMIN', email: 'admin@example.edu' };
function MemberDestination() {
  const location = useLocation();
  return <><h1>Requested member destination</h1><p>{location.pathname + location.search}</p></>;
}
function loginPage(from) {
  render(<AuthProvider initialUser={null}><MemoryRouter initialEntries={[{ pathname: '/', state: from ? { from } : null }]}><Routes><Route path="/" element={<Login />} /><Route path="/admin" element={<h1>Admin destination</h1>} /><Route path="/saved-interests" element={<MemberDestination />} /></Routes></MemoryRouter></AuthProvider>);
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
  test('MFA login returns to the requested member page with its query', async () => {
    auth.login.mockResolvedValue({ mfaRequired: true }); securityRequest.mockResolvedValue(user);
    loginPage('/saved-interests?page=2'); const events = await enterLogin();
    await events.type(await screen.findByLabelText(/^Authentication code/), '123456');
    await events.click(screen.getByRole('button', { name: 'Verify', exact: true }));
    expect(await screen.findByText('Requested member destination')).toBeInTheDocument();
    expect(screen.getByText('/saved-interests?page=2')).toBeInTheDocument();
    expect(screen.queryByText('Admin destination')).not.toBeInTheDocument();
  });
  test('concurrent MFA submissions make one request and keep controls busy until completion', async () => {
    let completeVerification;
    auth.login.mockResolvedValue({ mfaRequired: true });
    securityRequest.mockImplementation(() => new Promise(resolve => { completeVerification = resolve; }));
    loginPage(); const events = await enterLogin();
    const code = await screen.findByLabelText(/^Authentication code/);
    await events.type(code, '123456');
    const verify = screen.getByRole('button', { name: 'Verify', exact: true });
    const form = verify.closest('form');
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(securityRequest).toHaveBeenCalledTimes(1);
    expect(verify).toBeDisabled();
    expect(verify).toHaveAttribute('aria-busy', 'true');
    expect(code).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart login' })).toBeDisabled();
    expect(screen.queryByText('Admin destination')).not.toBeInTheDocument();
    await act(async () => { completeVerification(user); });
    expect(await screen.findByText('Admin destination')).toBeInTheDocument();
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
