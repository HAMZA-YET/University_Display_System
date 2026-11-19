import { Outlet } from 'react-router-dom';

/** Wraps every lost-and-found page in the module's own theme (see styles/lostFound.css). */
export default function LfLayout() {
  return (
    <div className="lf-theme">
      <Outlet />
    </div>
  );
}
