import { forwardRef, useCallback, useId, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { zonedParts } from '../../lib/time';

const MONTHS = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, month, 1))));
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fullDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function dateOnly(year, month, day) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
function isoDate(date) {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = dateOnly(year, month - 1, day);
  return year >= 1 && isoDate(date) === value ? date : null;
}
function addDays(date, count) {
  return dateOnly(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + count);
}
function inMonth(date, year, month) {
  return dateOnly(year, month, Math.min(date.getUTCDate(), dateOnly(year, month + 1, 0).getUTCDate()));
}
function koreaToday() {
  const { year, month, day } = zonedParts(new Date(), 'Asia/Seoul');
  return dateOnly(year, month, day);
}

function CalendarPopup({ anchorRef, id, label, selected, min, max, onSelect, onClose }) {
  const popupRef = useRef(null);
  const focusGrid = useRef(true);
  const helpId = useId();
  const today = koreaToday();
  const minimum = parseDate(min) || dateOnly(1, 0, 1);
  const maximum = parseDate(max) || dateOnly(9999, 11, 31);
  const clamp = (date) => new Date(Math.max(minimum.getTime(), Math.min(maximum.getTime(), date.getTime())));
  const allowed = (date) => date >= minimum && date <= maximum;
  const [cursor, setCursor] = useState(() => clamp(parseDate(selected) || today));
  const active = isoDate(cursor);
  const year = cursor.getUTCFullYear(), month = cursor.getUTCMonth();
  const monthAvailable = (y, m) => dateOnly(y, m + 1, 0) >= minimum && dateOnly(y, m, 1) <= maximum;
  const first = dateOnly(year, month, 1);
  const firstCell = addDays(first, -((first.getUTCDay() + 6) % 7));
  const years = Array.from({ length: Math.max(0, Math.min(maximum.getUTCFullYear(), year + 100) - Math.max(minimum.getUTCFullYear(), year - 100) + 1) },
    (_, index) => Math.max(minimum.getUTCFullYear(), year - 100) + index);

  useLayoutEffect(() => {
    function position() {
      const popup = popupRef.current, anchor = anchorRef.current;
      if (!popup || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      const bounds = popup.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 20;
      const above = rect.top - 20;
      const top = below >= bounds.height || below >= above ? rect.bottom + 8 : rect.top - bounds.height - 8;
      popup.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - bounds.width - 12))}px`;
      popup.style.top = `${Math.max(12, Math.min(top, window.innerHeight - bounds.height - 12))}px`;
    }
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (focusGrid.current) {
      popupRef.current?.querySelector(`[data-date="${active}"]:not(:disabled)`)?.focus({ preventScroll: true });
      focusGrid.current = false;
    }
  }, [active]);

  useEffect(() => {
    const outside = (target) => !popupRef.current?.contains(target) && !anchorRef.current?.contains(target);
    function pointer(event) { if (outside(event.target)) onClose(false); }
    function focus(event) { if (outside(event.target)) onClose(false); }
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('focusin', focus);
    return () => {
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('focusin', focus);
    };
  }, [anchorRef, onClose]);

  function moveMonth(y, m) { focusGrid.current = false; setCursor(clamp(inMonth(cursor, y, m))); }
  function moveDay(event) {
    let next;
    const day = (cursor.getUTCDay() + 6) % 7;
    if (event.key === 'ArrowLeft') next = addDays(cursor, -1);
    else if (event.key === 'ArrowRight') next = addDays(cursor, 1);
    else if (event.key === 'ArrowUp') next = addDays(cursor, -7);
    else if (event.key === 'ArrowDown') next = addDays(cursor, 7);
    else if (event.key === 'Home') next = addDays(cursor, -day);
    else if (event.key === 'End') next = addDays(cursor, 6 - day);
    else if (event.key === 'PageUp') next = inMonth(cursor, year - (event.shiftKey ? 1 : 0), month - (event.shiftKey ? 0 : 1));
    else if (event.key === 'PageDown') next = inMonth(cursor, year + (event.shiftKey ? 1 : 0), month + (event.shiftKey ? 0 : 1));
    if (next) { event.preventDefault(); focusGrid.current = true; setCursor(clamp(next)); }
  }

  return createPortal(
    <div ref={popupRef} id={id} className="date-picker-popover" role="dialog" aria-label={label} aria-describedby={helpId} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    }}>
      <div className="date-picker-heading"><span>Choose a date <small>Korea Standard Time</small></span><button type="button" className="date-picker-close" aria-label="Close calendar" onClick={() => onClose()}><Icon name="close" size={17} /></button></div>
      <div className="date-picker-navigation">
        <button type="button" className="date-picker-arrow" aria-label="Previous month" disabled={!monthAvailable(year, month - 1)} onClick={() => moveMonth(year, month - 1)}><Icon name="chevronLeft" size={17} /></button>
        <select aria-label="Month" value={month} onChange={(event) => moveMonth(year, Number(event.target.value))}>{MONTHS.map((name, index) => <option key={name} value={index} disabled={!monthAvailable(year, index)}>{name}</option>)}</select>
        <select aria-label="Year" value={year} onChange={(event) => moveMonth(Number(event.target.value), month)}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select>
        <button type="button" className="date-picker-arrow" aria-label="Next month" disabled={!monthAvailable(year, month + 1)} onClick={() => moveMonth(year, month + 1)}><Icon name="chevronRight" size={17} /></button>
      </div>
      <p className="visually-hidden" id={helpId}>Use arrow keys to move by day or week, Home and End for the week, and Page Up or Page Down for the month. Hold Shift to move by year. Enter selects a date. Escape closes the calendar.</p>
      <table className="date-picker-grid" role="grid" aria-label={`${MONTHS[month]} ${year}`}>
        <thead><tr>{WEEKDAYS.map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 6 }, (_, week) => <tr key={week}>{Array.from({ length: 7 }, (_, day) => {
          const date = addDays(firstCell, week * 7 + day), value = isoDate(date);
          return <td key={value} aria-selected={value === selected}><button type="button" data-date={value} className={date.getUTCMonth() === month ? 'date-picker-day' : 'date-picker-day date-picker-adjacent'} tabIndex={value === active ? 0 : -1} aria-label={fullDate.format(date)} aria-pressed={value === selected} aria-current={value === isoDate(today) ? 'date' : undefined} disabled={!allowed(date)} onKeyDown={moveDay} onClick={() => onSelect(value)}>{date.getUTCDate()}</button></td>;
        })}</tr>)}</tbody>
      </table>
      <div className="date-picker-footer"><button type="button" onClick={() => onSelect('')} disabled={!selected}>Clear date</button><button type="button" onClick={() => onSelect(isoDate(today))} disabled={!allowed(today)}>Today</button></div>
    </div>, document.body
  );
}

const DateInput = forwardRef(function DateInput({ calendarLabel = 'date', disabled, readOnly, onKeyDown, ...props }, forwardedRef) {
  const inputRef = useRef(null), anchorRef = useRef(null), triggerRef = useRef(null);
  const popupId = useId();
  const [calendar, setCalendar] = useState(null);
  const open = calendar !== null;
  const setInputRef = useCallback((node) => {
    inputRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  const close = useCallback((restoreFocus = true) => {
    setCalendar(null);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);
  if (open && (disabled || readOnly)) setCalendar(null);

  function openCalendar() { setCalendar({ selected: inputRef.current?.value || '' }); }

  function select(value) {
    const input = inputRef.current;
    if (!input || disabled || readOnly) return;
    if (input.value !== value) {
      // Bypass React's value tracker, then dispatch the same bubbling input /
      // change events as a native date edit. Consumers receive the real input.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  }
  const label = `Choose date for ${calendarLabel}`;
  return (
    <div className="date-input-control" ref={anchorRef} onKeyDown={(event) => {
      if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
      <input {...props} ref={setInputRef} type="date" disabled={disabled} readOnly={readOnly} onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented && event.altKey && event.key === 'ArrowDown' && !disabled && !readOnly) { event.preventDefault(); openCalendar(); }
      }} />
      <button ref={triggerRef} type="button" className="date-input-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open && !disabled && !readOnly} aria-controls={open ? popupId : undefined} disabled={disabled || readOnly} onClick={() => open ? close() : openCalendar()}><Icon name="calendar" size={19} /></button>
      {open && !disabled && !readOnly && <CalendarPopup anchorRef={anchorRef} id={popupId} label={label} selected={calendar.selected} min={props.min} max={props.max} onSelect={select} onClose={close} />}
    </div>
  );
});

export default DateInput;
