import { lazy, Suspense, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import PageLoadBoundary from '../components/layout/PageLoadBoundary';

test('a rejected page download keeps the shell available and another route can render', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const UnavailablePage = lazy(() => Promise.reject(new Error('Chunk download failed')));
  try {
    const { rerender } = render(<><header>Campus navigation</header><PageLoadBoundary key="broken"><Suspense fallback="Loading"><UnavailablePage /></Suspense></PageLoadBoundary></>);
    expect(await screen.findByRole('heading', { name: 'This page could not load' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByText('Campus navigation')).toBeInTheDocument();
    rerender(<><header>Campus navigation</header><PageLoadBoundary key="next"><h1>Another page</h1></PageLoadBoundary></>);
    expect(screen.getByRole('heading', { name: 'Another page' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally { consoleError.mockRestore(); }
});

function Content({ fails = false }) {
  const [value, setValue] = useState('');
  if (fails) throw new Error('Isolated page failure');
  return <input aria-label="Local page value" value={value} onChange={event => setValue(event.target.value)} />;
}

test('filter navigation preserves page state and can reset an actual page error', async () => {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { rerender } = render(<PageLoadBoundary resetKey="/notices"><Content /></PageLoadBoundary>);
    fireEvent.change(screen.getByLabelText('Local page value'), { target: { value: 'Keep editing' } });
    rerender(<PageLoadBoundary resetKey="/notices?category=EXAM"><Content /></PageLoadBoundary>);
    expect(screen.getByLabelText('Local page value')).toHaveValue('Keep editing');
    rerender(<PageLoadBoundary resetKey="/notices?category=EXAM"><Content fails /></PageLoadBoundary>);
    expect(screen.getByText('This page could not load')).toBeInTheDocument();
    rerender(<PageLoadBoundary resetKey="/notices?category=GENERAL"><Content /></PageLoadBoundary>);
    expect(await screen.findByLabelText('Local page value')).toHaveValue('');
    expect(screen.queryByText('This page could not load')).not.toBeInTheDocument();
  } finally { errorLog.mockRestore(); }
});
