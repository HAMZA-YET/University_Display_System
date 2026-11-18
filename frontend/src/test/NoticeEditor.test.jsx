import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../api/client';

vi.mock('../api/notices', () => ({
  getNotice: vi.fn(),
  createNotice: vi.fn(),
  updateNotice: vi.fn(),
  submitNotice: vi.fn(),
  listDepartments: vi.fn().mockResolvedValue([{ code: 'BSC', name: 'Bachelor of Smart Computing' }]),
  uploadAttachment: vi.fn(),
}));

import * as noticesApi from '../api/notices';
import NoticeEditor from '../pages/author/NoticeEditor';

const draft = {
  id: 'n1',
  title: 'Dormitory maintenance notice',
  summary: 'Maintenance in Dormitory A next week.',
  body: '',
  category: 'GENERAL',
  department: 'BSC',
  audience: 'STUDENTS',
  visibility: 'PUBLIC',
  publishingOffice: 'Facilities Office',
  contactEmail: '',
  status: 'DRAFT',
  effectiveStatus: 'DRAFT',
  version: 3,
  attachments: [],
  reviewHistory: [],
  event: null,
};

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/author/notices/n1/edit']}>
      <Routes>
        <Route path="/author/notices/:id/edit" element={<NoticeEditor />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FE NoticeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noticesApi.getNotice.mockResolvedValue(draft);
  });

  test('FE-4 shows the conflict banner on a 409 response and keeps the typed text', async () => {
    noticesApi.updateNotice.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'VERSION_CONFLICT',
        message: 'This notice has been modified by another user. Please reload the latest version before saving.',
        currentVersion: 4,
      })
    );
    renderEditor();
    const title = await screen.findByLabelText(/^Title/);
    expect(screen.getByTestId('version')).toHaveTextContent('Version 3');
    await userEvent.clear(title);
    await userEvent.type(title, 'Dormitory B maintenance (my edit)');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText('Your changes were not saved')).toBeInTheDocument();
    expect(screen.getByText('This notice has been modified by another user. Please reload the latest version before saving.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load latest version/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy my changes/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Dormitory B maintenance (my edit)');
    expect(screen.queryByText(/^Saved at/)).not.toBeInTheDocument();
    // Never resent automatically.
    expect(noticesApi.updateNotice).toHaveBeenCalledTimes(1);
    expect(noticesApi.updateNotice.mock.calls[0][2]).toBe(3);
  });

  test('FE-5 shows "Saved" only after the server confirms', async () => {
    noticesApi.updateNotice.mockResolvedValue({ ...draft, version: 4 });
    renderEditor();
    await screen.findByLabelText(/^Title/);
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect((await screen.findAllByText(/Saved at .* Version 4\./)).length).toBeGreaterThan(0);
  });
});
