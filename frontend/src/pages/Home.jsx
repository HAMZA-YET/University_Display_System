import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import NoticeCard from '../components/notices/NoticeCard';
import EventCard from '../components/events/EventCard';
import ProfessorCard from '../components/professors/ProfessorCard';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import { DataState } from '../components/ui/States';
import useApi from '../hooks/useApi';
import useDepartments from '../hooks/useDepartments';
import { getHome } from '../api/notices';
import { listPublicEvents } from '../api/events';
import { listProfessors, professorDepartments } from '../api/professors';
import { formatDate } from '../lib/time';

const QUICK_LINKS = [
  { to: '/notices', icon: 'file', title: 'Campus notices', text: 'The updates that matter to you' },
  { to: '/events', icon: 'calendar', title: 'Events & activities', text: 'Make room for something new' },
  { to: '/professors', icon: 'user', title: 'Professor directory', text: 'Find the right person to ask' },
  { to: '/search?source=all', icon: 'search', title: 'Campus search', text: 'Find notices, faculty and more' },
];

function SectionHeading({ eyebrow, title, to, link = 'View all' }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{to && <Link to={to} className="section-link">{link}<Icon name="arrowRight" size={16} /></Link>}</div>;
}

export default function Home() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { byCode } = useDepartments();
  const home = useApi(getHome, []);
  const events = useApi(() => listPublicEvents({ state: 'UPCOMING', limit: 3 }), []);
  const depts = useApi(professorDepartments, []);
  const professors = useApi(() => listProfessors({ limit: 3 }), []);

  useEffect(() => { document.title = 'Your campus, connected — KDU Global UIDS'; }, []);

  return (
    <div className="home-page">
      <div className="home-intro"><span><span className="status-dot" />Welcome to your campus hub</span><time dateTime={new Date().toISOString()}>{formatDate(new Date())} · KST</time></div>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">KDU GLOBAL · CAMPUS LIFE</p>
          <h1 id="home-title">Your campus.<br /><span>In one place.</span></h1>
          <p className="hero-description">From the next big opportunity to the everyday details. Stay informed, find your people, and make the most of life at KDU.</p>
          <form className="hero-search" role="search" aria-label="Search campus information" onSubmit={(event) => {
            event.preventDefault();
            const params = new URLSearchParams({ source: 'all' });
            if (q.trim()) params.set('q', q.trim());
            navigate(`/search?${params}`);
          }}>
            <Icon name="search" size={20} />
            <label className="visually-hidden" htmlFor="home-search">Search campus information</label>
            <input id="home-search" type="search" maxLength={100} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Notices, scholarships, professors..." />
            <Button type="submit">Search<Icon name="arrowRight" size={16} /></Button>
          </form>
          <div className="hero-popular"><span>Explore</span><Link to="/notices?category=SCHOLARSHIP">Scholarships</Link><Link to="/events">Campus events</Link><Link to="/professors">Find a professor</Link></div>
        </div>
        <figure className="hero-media"><img src="/assets/campus-hero.webp" srcSet="/assets/campus-hero-small.webp 800w, /assets/campus-hero.webp 1600w" sizes="(max-width: 700px) 100vw, 55vw" alt="Illustrative university campus with academic buildings and open green spaces" fetchPriority="high" /><figcaption>Illustrative campus image</figcaption><div className="hero-image-note"><span className="hero-note-icon"><Icon name="building" size={22} /></span><div><strong>A world of possibilities.</strong><span>One connected campus community.</span></div></div></figure>
      </section>

      <nav className="quick-links" aria-label="Campus shortcuts">
        {QUICK_LINKS.map((item) => <Link key={item.to} to={item.to} className="quick-link"><span className="quick-link-icon"><Icon name={item.icon} size={22} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><Icon name="arrowRight" size={17} /></Link>)}
      </nav>

      <div className="home-content-grid">
        <div className="home-primary">
          <section className="content-section" aria-labelledby="important-title">
            <div className="section-heading"><div><p className="eyebrow">GOOD TO KNOW</p><h2 id="important-title">Don't miss these</h2></div><span className="section-note"><Icon name="pin" size={14} />Important updates</span></div>
            <DataState {...home} onRetry={home.reload} isEmpty={(data) => !data.important.length} emptyTitle="You're all caught up" emptyText="Important and pinned campus updates will appear here.">
              {(data) => <div className="grid grid-2">{data.important.slice(0, 2).map((notice) => <NoticeCard key={notice.id} notice={notice} departments={byCode} />)}</div>}
            </DataState>
          </section>
          <section className="content-section" aria-label="Latest notices">
            <SectionHeading eyebrow="THE CAMPUS BULLETIN" title="Latest notices" to="/notices" link="All notices" />
            <DataState {...home} onRetry={home.reload} isEmpty={(data) => !data.latest.length} emptyTitle="A fresh start" emptyText="Published notices will appear here. Check back for campus news and opportunities.">
              {(data) => <div className="grid grid-2">{data.latest.slice(0, 6).map((notice) => <NoticeCard key={notice.id} notice={notice} departments={byCode} />)}</div>}
            </DataState>
          </section>
        </div>
        <aside className="home-sidebar">
          <section className="sidebar-panel" aria-label="Upcoming events">
            <SectionHeading eyebrow="SAVE THE DATE" title="Coming up" to="/events" link="Calendar" />
            <DataState {...events} onRetry={events.reload} isEmpty={(data) => !data.data.length} emptyTitle="More to look forward to" emptyText="Upcoming campus events will appear here.">
              {(data) => <div className="event-preview-list">{data.data.map((event) => <EventCard key={event.id} event={event} compact />)}</div>}
            </DataState>
          </section>
          <section className="directory-promo" aria-label="Explore departments">
            <img src="/assets/campus-detail.svg" alt="" loading="lazy" width="300" height="160" />
            <p className="eyebrow">HERE TO HELP YOU GROW</p><h2>Find your faculty.</h2><p>Discover the people, subjects, and office hours behind your department.</p>
            <DataState {...depts} onRetry={depts.reload} isEmpty={(data) => !data.length} emptyTitle="Directory coming together" emptyText="Departments will appear as profiles are added.">
              {(data) => <div className="department-links">{data.map((department) => <Link key={department.code} to={`/professors?department=${encodeURIComponent(department.code)}`} title={department.name}>{department.code}<span>{department.count}</span></Link>)}</div>}
            </DataState>
            <Link to="/professors" className="section-link">Explore the directory<Icon name="arrowRight" size={16} /></Link>
          </section>
        </aside>
      </div>
      <section className="content-section faculty-section" aria-label="Professor directory preview">
        <SectionHeading eyebrow="PEOPLE BEHIND THE POSSIBILITIES" title="Meet your faculty" to="/professors" link="All professors" />
        <DataState {...professors} onRetry={professors.reload} isEmpty={(data) => !data.data.length} emptyTitle="Your faculty, soon within reach" emptyText="Professor profiles and office hours will appear as the directory grows.">
          {(data) => <div className="grid grid-3">{data.data.slice(0, 3).map((professor) => <ProfessorCard key={professor.id} professor={professor} departmentName={byCode[professor.department]} />)}</div>}
        </DataState>
      </section>
      <div className="campus-help-banner"><div><Icon name="info" size={24} /><span><strong>A little help goes a long way.</strong><small>Looking for something? Search notices or connect with your professor.</small></span></div><Link to="/search?source=all">Find campus information<Icon name="arrowRight" size={18} /></Link></div>
    </div>
  );
}
