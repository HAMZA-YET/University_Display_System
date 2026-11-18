import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NoticeForm from '../components/notices/NoticeForm';
import { ApiError } from '../api/client';

const departments = [{ code: 'BSC', name: 'Bachelor of Smart Computing' }];

describe('FE NoticeForm', () => {
  test('FE-1 shows field errors and blocks submit when required fields are missing', async () => {
    const onSubmitForReview = vi.fn();
    const onSaveDraft = vi.fn();
    render(<NoticeForm departments={departments} onSaveDraft={onSaveDraft} onSubmitForReview={onSubmitForReview} />);
    await userEvent.type(screen.getByLabelText(/^Title/), 'Exam timetable');
    await userEvent.click(screen.getByRole('button', { name: /submit for review/i }));
    expect(await screen.findByText('Summary must be at least 10 characters')).toBeInTheDocument();
    expect(screen.getByText('Body must be at least 20 characters')).toBeInTheDocument();
    expect(screen.getByText('Category is required')).toBeInTheDocument();
    expect(screen.getByText('Department is required')).toBeInTheDocument();
    expect(screen.getByText('Publishing office is required')).toBeInTheDocument();
    expect(screen.getByText('Requested publication start is required')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Summary/)).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmitForReview).not.toHaveBeenCalled();
  });

  test('FE-2 save draft needs only a title', async () => {
    const onSaveDraft = vi.fn().mockResolvedValue({});
    render(<NoticeForm departments={departments} onSaveDraft={onSaveDraft} onSubmitForReview={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(await screen.findByText('Title must be at least 5 characters')).toBeInTheDocument();
    expect(onSaveDraft).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Library hours');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(onSaveDraft.mock.calls[0][0].title).toBe('Library hours');
  });

  test('FE-3 maps server 400 details onto the matching fields', async () => {
    const onSaveDraft = vi.fn().mockRejectedValue(
      new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Some fields are not valid.', details: [{ field: 'department', message: 'Unknown department code "XYZ"' }] })
    );
    render(<NoticeForm departments={departments} onSaveDraft={onSaveDraft} onSubmitForReview={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^Title/), 'Library hours');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(await screen.findByText('Unknown department code "XYZ"')).toBeInTheDocument();
  });
});
