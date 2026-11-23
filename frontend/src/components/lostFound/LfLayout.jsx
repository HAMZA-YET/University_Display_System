import { Outlet } from 'react-router-dom';

/** Scopes the lost-and-found styles (styles/lostFound.css) to these pages. */
export default function LfLayout() {
  return (
    <div className="lf-module">
      <Outlet />
    </div>
  );
}
