import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), video[controls], audio[controls], [tabindex]:not([tabindex="-1"])';

function focusableItems(node) {
  return Array.from(node.querySelectorAll(FOCUSABLE)).filter((element) => {
    const media = element.closest('video, audio');
    if (media && media !== element) return false;
    if (element.hasAttribute('data-modal-focus-guard') || element.closest('[hidden], [inert]') || (element.hasAttribute('tabindex') && element.tabIndex < 0)) return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' && element.getClientRects().length > 0;
  });
}

const nativeMedia = (element) => element?.matches('video[controls], audio[controls]');

/** Accessible dialog: traps focus, closes with Escape, restores focus on close. */
export default function Modal({ open, title, onClose, children, footer, wide = false }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const lastFocused = useRef(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    lastFocused.current = document.activeElement;
    const node = dialogRef.current;
    const focusables = node ? focusableItems(node) : [];
    const first = focusables.find((el) => !el.classList.contains('modal-close'));
    (first || node).focus();

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = focusableItems(node);
      if (!items.length) return;
      // Let the browser traverse play, timeline and volume inside native media.
      if (nativeMedia(document.activeElement)) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (lastFocused.current && lastFocused.current.focus) lastFocused.current.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
        {/* Native media's inner Tab stops do not all bubble keydown events. */}
        <span className="visually-hidden" tabIndex={0} aria-hidden="true" data-modal-focus-guard="" onFocus={() => {
          const node = dialogRef.current;
          if (node) (focusableItems(node)[0] || node).focus();
        }} />
      </div>
    </div>,
    document.body
  );
}
