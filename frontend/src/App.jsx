import { Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import NavBar from './components/layout/NavBar';
import Footer from './components/layout/Footer';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Home from './pages/Home';
import Notices from './pages/Notices';
import NoticeDetails from './pages/NoticeDetails';
import Events from './pages/Events';
import Professors from './pages/Professors';
import Login from './pages/Login';
import Register from './pages/Register';
import Setup from './pages/Setup';
import NotFound from './pages/NotFound';
import Forbidden from './pages/Forbidden';
import AuthorWorkspace from './pages/author/AuthorWorkspace';
import NoticeEditor from './pages/author/NoticeEditor';
import NoticePreview from './pages/author/NoticePreview';
import NoticeRevise from './pages/author/NoticeRevise';
import ReviewerQueue from './pages/reviewer/ReviewerQueue';
import ReviewNotice from './pages/reviewer/ReviewNotice';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProfessors from './pages/admin/AdminProfessors';
import AdminUsers from './pages/admin/AdminUsers';
import AdminDepartments from './pages/admin/AdminDepartments';
import DomainEvents from './pages/admin/DomainEvents';
import Member4Routes from './member4/Member4Routes';

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
        </div>
      </main>
      <Footer />
    </div>
  );
}
