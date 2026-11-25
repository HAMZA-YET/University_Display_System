import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkDeletableTable from '../components/lostFound/BulkDeletableTable';

const rows = [
  { id: 'r1', title: 'Umbrella' },
  { id: 'r2', title: 'Water bottle' },
  { id: 'r3', title: 'ID card' },
];
const columns = [{ key: 'title', header: 'Item', render: (r) => r.title }];

function setup(deleteOne = vi.fn().mockResolvedValue()) {
  const onDone = vi.fn();
  render(<BulkDeletableTable caption="t" columns={columns} rows={rows} deleteOne={deleteOne} onDone={onDone} itemNoun="report" />);
  return { deleteOne, onDone };
}

describe('BulkDeletableTable', () => {
  test('BULK-1 checkboxes are hidden until "Select" is pressed', async () => {
    setup();
    expect(screen.queryByLabelText('Select Umbrella')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByLabelText('Select all (3)')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Umbrella')).toBeInTheDocument();
  });

  test('BULK-2 select all, untick one, then delete only the selected rows', async () => {
    const { deleteOne, onDone } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByLabelText('Select all (3)'));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Select ID card')); // untick -> 2 left
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected (2)' }));
    expect(screen.getByText('Delete 2 reports?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete 2 reports' }));
    expect(deleteOne).toHaveBeenCalledTimes(2);
    expect(deleteOne).toHaveBeenCalledWith('r1');
    expect(deleteOne).toHaveBeenCalledWith('r2');
    expect(deleteOne).not.toHaveBeenCalledWith('r3');
    expect(onDone).toHaveBeenCalled();
  });

  test('BULK-3 pick individual rows without select all', async () => {
    const { deleteOne } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByLabelText('Select Water bottle'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete 1 report' }));
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(deleteOne).toHaveBeenCalledWith('r2');
  });

  test('BULK-4 Cancel leaves selection mode and clears checkboxes', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByLabelText('Select Umbrella'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Select Umbrella')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
  });

  test('BULK-5 no Select button when there are no rows', () => {
    render(<BulkDeletableTable caption="t" columns={columns} rows={[]} deleteOne={vi.fn()} onDone={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
  });
});
