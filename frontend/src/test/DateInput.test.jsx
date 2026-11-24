import { createRef, useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import Input from '../components/ui/Input';

afterEach(() => { vi.useRealTimers(); });

function ControlledDate({ initial = '', onChange = () => {}, ...props }) {
  const [value, setValue] = useState(initial);
  return <Input label="Published from" type="date" value={value} onChange={(event) => {
    onChange(event);
    setValue(event.target.value);
  }} {...props} />;
}
const open = () => {
  const trigger = screen.getByRole('button', { name: 'Choose date for Published from' });
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole('dialog', { name: 'Choose date for Published from' }) };
};
const day = (name) => screen.getByRole('button', { name, exact: true });

test('preserves native date input, forwarded ref, field associations, limits and manual ISO entry', () => {
  const ref = createRef(), values = [];
  render(<Input ref={ref} id="published-date" label="Published from" type="date" defaultValue="2024-02-28" min="2024-02-01" max="2024-03-31" hint="Korea Standard Time" error="Check this date" required name="published" onChange={(event) => values.push(event.target.value)} />);
  const input = screen.getByLabelText(/^Published from/);
  expect(ref.current).toBe(input);
  expect(input).toHaveAttribute('type', 'date');
  expect(input).toHaveAttribute('name', 'published');
  expect(input).toHaveAttribute('min', '2024-02-01');
  expect(input).toHaveAttribute('max', '2024-03-31');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAttribute('aria-required', 'true');
  expect(input).toHaveAccessibleDescription('Korea Standard Time Check this date');
  fireEvent.change(input, { target: { value: '2024-02-29' } });
  expect(values).toEqual(['2024-02-29']);
  expect(input.value).toBe('2024-02-29');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('month and year browsing handles leap years without changing the controlled value until selection', () => {
  const values = [];
  render(<ControlledDate initial="2024-02-29" onChange={(event) => values.push(event.target.value)} />);
  const { dialog, trigger } = open();
  expect(document.body).toContainElement(dialog);
  expect(trigger).toHaveAttribute('aria-controls', dialog.id);
  expect(day('Thursday, 29 February 2024')).toHaveFocus();
  expect(day('Thursday, 29 February 2024')).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Year' }), { target: { value: '2023' } });
  expect(day('Tuesday, 28 February 2023')).toHaveAttribute('tabindex', '0');
  expect(screen.queryByRole('button', { name: 'Wednesday, 29 February 2023' })).not.toBeInTheDocument();
  expect(values).toEqual([]);
  expect(screen.getByLabelText('Published from').value).toBe('2024-02-29');
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Year' }), { target: { value: '2032' } });
  fireEvent.click(day('Sunday, 29 February 2032'));
  expect(values).toEqual(['2032-02-29']);
  expect(screen.getByLabelText('Published from').value).toBe('2032-02-29');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('popup selection emits one normal bubbling React change from the real native input', () => {
  const events = [], parentChanges = [];
  render(<div onChange={(event) => parentChanges.push(event.target.value)}><ControlledDate initial="2024-03-01" onChange={(event) => events.push({ target: event.target, value: event.target.value, type: event.type })} /></div>);
  open();
  fireEvent.click(day('Thursday, 29 February 2024'));
  const input = screen.getByLabelText('Published from');
  expect(events).toEqual([{ target: input, value: '2024-02-29', type: 'change' }]);
  expect(parentChanges).toEqual(['2024-02-29']);
  expect(input.value).toBe('2024-02-29');
});

test('date limits disable outside days, unavailable months and Today, and clamp keyboard navigation', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-24T16:00:00Z'));
  const values = [];
  render(<ControlledDate initial="2024-02-28" min="2024-02-28" max="2024-03-02" onChange={(event) => values.push(event.target.value)} />);
  const { dialog } = open();
  expect(day('Tuesday, 27 February 2024')).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Previous month' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Today', exact: true })).toBeDisabled();
  fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
  expect(day('Wednesday, 28 February 2024')).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
  expect(day('Saturday, 2 March 2024')).toHaveFocus();
  expect(within(dialog).getByRole('button', { name: 'Next month' })).toBeDisabled();
  expect(values).toEqual([]);
  fireEvent.click(day('Saturday, 2 March 2024'));
  expect(values).toEqual(['2024-03-02']);
});

test('arrow, week-edge and month/year keyboard movement use date-only maths without committing', () => {
  const values = [];
  render(<ControlledDate initial="2024-02-28" onChange={(event) => values.push(event.target.value)} />);
  open();
  fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
  expect(day('Thursday, 29 February 2024')).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'Home' });
  expect(day('Monday, 26 February 2024')).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'End' });
  expect(day('Sunday, 3 March 2024')).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'PageUp' });
  expect(day('Saturday, 3 February 2024')).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'PageDown', shiftKey: true });
  expect(day('Monday, 3 February 2025')).toHaveFocus();
  expect(values).toEqual([]);
});

test('Today uses Korea Standard Time across a UTC date boundary and Clear emits an empty native date', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-24T16:00:00Z'));
  const values = [];
  render(<ControlledDate onChange={(event) => values.push(event.target.value)} />);
  const { dialog } = open();
  expect(day('Wednesday, 25 November 2026')).toHaveAttribute('aria-current', 'date');
  expect(day('Wednesday, 25 November 2026')).toHaveFocus();
  expect(within(dialog).getByRole('button', { name: 'Clear date' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Today', exact: true }));
  expect(values).toEqual(['2026-11-25']);
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));
  expect(values).toEqual(['2026-11-25', '']);
  expect(screen.getByLabelText('Published from').value).toBe('');
});

test('Escape restores trigger focus and outside pointer closes without stealing clicked-control focus; Alt+Down opens', () => {
  const onChange = vi.fn();
  render(<><ControlledDate initial="2024-02-29" onChange={onChange} /><button type="button" data-testid="outside">Outside</button></>);
  const { trigger } = open();
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  const input = screen.getByLabelText('Published from');
  fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.pointerDown(screen.getByTestId('outside'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).not.toHaveFocus();
  screen.getByTestId('outside').focus();
  expect(screen.getByTestId('outside')).toHaveFocus();
  expect(onChange).not.toHaveBeenCalled();
});

test('repeat keyboard month navigation and header selectors retain their own focus without selecting a date', async () => {
  const user = userEvent.setup(), values = [];
  render(<ControlledDate initial="2024-02-29" onChange={(event) => values.push(event.target.value)} />);
  const { dialog } = open();
  const next = within(dialog).getByRole('button', { name: 'Next month' });
  next.focus();
  await user.keyboard('{Enter}{Enter}');
  expect(next).toHaveFocus();
  expect(within(dialog).getByRole('combobox', { name: 'Month' })).toHaveValue('3');
  const previous = within(dialog).getByRole('button', { name: 'Previous month' });
  previous.focus();
  await user.keyboard('{Enter}{Enter}');
  expect(previous).toHaveFocus();
  expect(within(dialog).getByRole('combobox', { name: 'Month' })).toHaveValue('1');
  const month = within(dialog).getByRole('combobox', { name: 'Month' });
  month.focus();
  fireEvent.change(month, { target: { value: '0' } });
  expect(month).toHaveFocus();
  const year = within(dialog).getByRole('combobox', { name: 'Year' });
  year.focus();
  fireEvent.change(year, { target: { value: '2032' } });
  expect(year).toHaveFocus();
  expect(values).toEqual([]);
  expect(screen.getByLabelText('Published from').value).toBe('2024-02-29');
});

test('calendar Escape stops before outer React and document keyboard handlers', () => {
  const outer = vi.fn(), documentKey = vi.fn();
  document.addEventListener('keydown', documentKey);
  try {
    render(<div onKeyDown={outer}><ControlledDate initial="2024-02-29" /></div>);
    const { trigger } = open();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(outer).not.toHaveBeenCalled();
    expect(documentKey).not.toHaveBeenCalled();
  } finally { document.removeEventListener('keydown', documentKey); }
});

test('disabled and read-only inputs cannot open a calendar and datetime-local stays native', () => {
  const { rerender } = render(<Input label="Published from" type="date" disabled />);
  expect(screen.getByRole('button', { name: 'Choose date for Published from' })).toBeDisabled();
  expect(screen.getByLabelText('Published from')).toBeDisabled();
  rerender(<Input label="Published from" type="date" readOnly />);
  expect(screen.getByRole('button', { name: 'Choose date for Published from' })).toBeDisabled();
  expect(screen.getByLabelText('Published from')).toHaveAttribute('readonly');
  fireEvent.keyDown(screen.getByLabelText('Published from'), { key: 'ArrowDown', altKey: true });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  rerender(<Input label="Start time" type="datetime-local" />);
  expect(screen.getByLabelText('Start time')).toHaveAttribute('type', 'datetime-local');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
