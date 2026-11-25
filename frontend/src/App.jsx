import { Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LoadingState } from './components/ui/States';
import NavBar from './components/layout/NavBar';
import Footer from './components/layout/Footer';
import ProtectedRoute from './components/layout/ProtectedRoute';
import PageLoadBoundary from './components/layout/PageLoadBoundary';
import NoticeToaster from './components/lostFound/NoticeToaster';
import Home from './pages/Home';
import Notices from './pages/Notices';
import NoticeDetails from './pages/NoticeDetails';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Forbidden from './pages/Forbidden';

// Keep common public/login screens eager; load optional workflows on demand.
const AccountSecurity = lazy(() => import('./pages/AccountSecurity'));
const AccountRecovery = lazy(() => import('./pages/AccountRecovery'));
const Events = lazy(() => import('./pages/Events'));
const Professors = lazy(() => import('./pages/Professors'));
const Register = lazy(() => import('./pages/Register'));
const Setup = lazy(() => import('./pages/Setup'));
const AuthorWorkspace = lazy(() => import('./pages/author/AuthorWorkspace'));
const NoticeEditor = lazy(() => import('./pages/author/NoticeEditor'));
const NoticePreview = lazy(() => import('./pages/author/NoticePreview'));
const NoticeRevise = lazy(() => import('./pages/author/NoticeRevise'));
const ReviewerQueue = lazy(() => import('./pages/reviewer/ReviewerQueue'));
const ReviewNotice = lazy(() => import('./pages/reviewer/ReviewNotice'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminProfessors = lazy(() => import('./pages/admin/AdminProfessors'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminDepartments = lazy(() => import('./pages/admin/AdminDepartments'));
const DomainEvents = lazy(() => import('./pages/admin/DomainEvents'));
const Member4Routes = lazy(() => import('./member4/Member4Routes'));
// Lost and found (Member 3)
const LfLayout = lazy(() => import('./components/lostFound/LfLayout'));
const LostFoundBrowse = lazy(() => import('./pages/lostFound/LostFoundBrowse'));
const LostFoundItem = lazy(() => import('./pages/lostFound/LostFoundItem'));
const ReportItem = lazy(() => import('./pages/lostFound/ReportItem'));
const MyCases = lazy(() => import('./pages/lostFound/MyCases'));
const MyReport = lazy(() => import('./pages/lostFound/MyReport'));
const MyClaim = lazy(() => import('./pages/lostFound/MyClaim'));
const AdminLfDashboard = lazy(() => import('./pages/adminLostFound/AdminLfDashboard'));
const AdminLfItems = lazy(() => import('./pages/adminLostFound/AdminLfItems'));
const AdminLfItem = lazy(() => import('./pages/adminLostFound/AdminLfItem'));
const AdminLfClaims = lazy(() => import('./pages/adminLostFound/AdminLfClaims'));

/** Routes only. Role checks here are a convenience; the server enforces them. */
export default function App() {
  const [setupToken, setSetupToken] = useState('');
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    const changedPage = previousPath.current !== location.pathname;
    previousPath.current = location.pathname;
    // Filters and browser Back retain their context; explicit return links
    // restore their own result/inbox focus after loading.
    if (!changedPage || navigationType === 'POP' || location.state?.focusReturn) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname, location.state?.focusReturn, navigationType]);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <NavBar />
      <NoticeToaster />
      <main id="main-content" tabIndex={-1}>
        <div className="container">
          <PageLoadBoundary key={location.pathname} resetKey={location.pathname + location.search}>
          <Suspense fallback={<LoadingState label="Loading page…" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/notices" element={<Notices />} />
            <Route path="/notices/:id" element={<NoticeDetails />} />
            <Route path="/events" element={<Events />} />
            <Route path="/professors" element={<Professors />} />
            <Route path="/login" element={<Login />} />
            <Route path="/account-recovery" element={<AccountRecovery />} />
            <Route element={<ProtectedRoute roles={['ADMIN', 'AUTHOR', 'REVIEWER', 'READER']} />}><Route path="/account-security" element={<AccountSecurity />} /></Route>
            <Route path="/register" element={<Register />} />
            <Route path="/setup" element={<Setup token={setupToken} onTokenChange={setSetupToken} />} />
            <Route path="/forbidden" element={<Forbidden />} />
            <Route path="/search" element={<Member4Routes />} />
            <Route path="/search-record/*" element={<Member4Routes />} />
            {/* Lost and found (Member 3): /items is the shared menu entry point */}
            <Route element={<LfLayout />}>
              {/* Everyone can open /items, but reports are listed only for signed-in
                  members; visitors see a login prompt instead of the list. */}
              <Route path="/items" element={<LostFoundBrowse />} />
              {/* Members only: visitors who are not logged in are sent to /login */}
              <Route element={<ProtectedRoute />}>
                <Route path="/items/:id" element={<LostFoundItem />} />
                <Route path="/items/report" element={<ReportItem />} />
                <Route path="/items/my-cases" element={<MyCases />} />
                <Route path="/items/my-reports/:id" element={<MyReport />} />
                <Route path="/items/my-reports/:id/edit" element={<ReportItem />} />
                <Route path="/items/my-claims/:id" element={<MyClaim />} />
              </Route>
              <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                <Route path="/admin/lost-found" element={<AdminLfDashboard />} />
                <Route path="/admin/lost-found/items" element={<AdminLfItems />} />
                <Route path="/admin/lost-found/items/:id" element={<AdminLfItem />} />
                <Route path="/admin/lost-found/claims" element={<AdminLfClaims />} />
              </Route>
            </Route>
            <Route path="/saved-interests" element={<Member4Routes />} />
            <Route path="/notifications" element={<Member4Routes />} />

            <Route element={<ProtectedRoute roles={['AUTHOR', 'ADMIN']} />}>
              <Route path="/author/notices" element={<AuthorWorkspace />} />
              <Route path="/author/notices/new" element={<NoticeEditor />} />
              <Route path="/author/notices/:id/edit" element={<NoticeEditor />} />
              <Route path="/author/notices/:id/preview" element={<NoticePreview />} />
              <Route path="/author/notices/:id/revise" element={<NoticeRevise />} />
            </Route>

            <Route element={<ProtectedRoute roles={['REVIEWER', 'ADMIN']} />}>
              <Route path="/reviewer/queue" element={<ReviewerQueue />} />
              <Route path="/reviewer/notices/:id" element={<ReviewNotice />} />
              <Route path="/admin/domain-events" element={<DomainEvents />} />
            </Route>

            <Route element={<ProtectedRoute roles={['ADMIN']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/professors" element={<AdminProfessors />} />
              <Route path="/admin/departments" element={<AdminDepartments />} />
              <Route path="/admin/users" element={<AdminUsers />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </PageLoadBoundary>
        </div>
      </main>
      <Footer />
    </div>
  );
}
