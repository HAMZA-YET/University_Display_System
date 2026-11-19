import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { LoadingState } from './components/ui/States';
import NavBar from './components/layout/NavBar';
import Footer from './components/layout/Footer';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Home from './pages/Home';
import Notices from './pages/Notices';
import NoticeDetails from './pages/NoticeDetails';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Forbidden from './pages/Forbidden';

// Keep common public/login screens eager; load optional workflows on demand.
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

/** Routes only. Role checks here are a convenience; the server enforces them. */
export default function App() {
  const [setupToken, setSetupToken] = useState('');
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <NavBar />
      <main id="main-content" tabIndex={-1}>
        <div className="container">
          <Suspense fallback={<LoadingState label="Loading page…" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/notices" element={<Notices />} />
            <Route path="/notices/:id" element={<NoticeDetails />} />
            <Route path="/events" element={<Events />} />
            <Route path="/professors" element={<Professors />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/setup" element={<Setup token={setupToken} onTokenChange={setSetupToken} />} />
            <Route path="/forbidden" element={<Forbidden />} />
            <Route path="/search" element={<Member4Routes />} />
            <Route path="/search-record/*" element={<Member4Routes />} />
            <Route path="/items/*" element={<Member4Routes />} />
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
        </div>
      </main>
      <Footer />
    </div>
  );
}
