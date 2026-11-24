import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Modal from '../components/ui/Modal';

beforeEach(() => {
  // JSDOM has no layout. Model rendered boxes so the focus trap can exclude
  // hidden elements; the browser check covers native media shadow controls.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
    return this.hidden || getComputedStyle(this).display === 'none' ? [] : [{ width: 30, height: 30 }];
  });
});
afterEach(() => vi.restoreAllMocks());

function ReviewDialog({ onClosed }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('2026-11-25T10:00');
  const [priority, setPriority] = useState('NORMAL');
  return <>
    <button type="button" onClick={() => setOpen(true)}>Review publication</button>
    <Modal open={open} title="Publication settings" onClose={() => {
      onClosed({ start, priority });
      setOpen(false);
    }} footer={<button type="button">Last dialog action</button>}>
      <label>Publishing office<input defaultValue="Academic office" /></label>
      <label>Publication start<input type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Priority<select value={priority} onChange={event => setPriority(event.target.value)}>
        <option value="NORMAL">Normal</option><option value="HIGH">High</option>
      </select></label>
    </Modal>
  </>;
}

test('controlled datetime and select edits retain focus and Escape uses the latest close callback', async () => {
  const user = userEvent.setup(), onClosed = vi.fn();
  render(<ReviewDialog onClosed={onClosed} />);
  const trigger = screen.getByRole('button', { name: 'Review publication' });
  await user.click(trigger);
  expect(screen.getByLabelText('Publishing office')).toHaveFocus();
  const start = screen.getByLabelText('Publication start');
  start.focus();
  fireEvent.change(start, { target: { value: '2026-12-20T13:30' } });
  expect(start).toHaveValue('2026-12-20T13:30');
  expect(start).toHaveFocus();
  const priority = screen.getByLabelText('Priority');
  await user.selectOptions(priority, 'HIGH');
  expect(priority).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onClosed).toHaveBeenCalledExactlyOnceWith({ start: '2026-12-20T13:30', priority: 'HIGH' });
  expect(trigger).toHaveFocus();
});

test('Tab and Shift+Tab still wrap inside the dialog after a controlled field changes', async () => {
  const user = userEvent.setup();
  render(<ReviewDialog onClosed={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Review publication' }));
  const start = screen.getByLabelText('Publication start');
  start.focus();
  fireEvent.change(start, { target: { value: '2026-12-01T09:00' } });
  const first = screen.getByRole('button', { name: 'Close dialog' });
  const last = screen.getByRole('button', { name: 'Last dialog action' });
  last.focus();
  await user.tab();
  expect(first).toHaveFocus();
  await user.tab({ shift: true });
  expect(last).toHaveFocus();
});

test('native media retains its Tab action and its end guard skips fallback links', () => {
  render(<><button type="button">Outside</button><Modal open title="University film" onClose={() => {}}>
    <video controls tabIndex={0} aria-label="University video"><a href="/fallback">Fallback link</a></video>
    <button type="button" hidden>Hidden action</button>
  </Modal></>);
  const video = screen.getByLabelText('University video');
  const close = screen.getByRole('button', { name: 'Close dialog' });
  expect(video).toHaveFocus();
  close.focus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(video).toHaveFocus();
  // The browser must receive Tab to traverse native playback controls.
  expect(fireEvent.keyDown(video, { key: 'Tab' })).toBe(true);
  const guard = screen.getByRole('dialog').querySelector('[data-modal-focus-guard]');
  guard.focus();
  expect(close).toHaveFocus();
});
