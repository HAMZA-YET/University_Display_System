import { lazy, Suspense } from 'react';
import { render, screen } from '@testing-library/react';
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
