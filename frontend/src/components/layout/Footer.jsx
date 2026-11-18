import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand"><div><img src="/assets/kdu-mark.svg" width="42" height="42" alt="" /><span><strong>KDU GLOBAL</strong><small>CAMPUS PORTAL</small></span></div><p>Your campus, connected.<br />Information for every part of university life.</p></div>
        <div><h2>Explore your campus</h2><Link to="/notices">Campus notices</Link><Link to="/events">Events &amp; activities</Link><Link to="/professors">Professor directory</Link></div>
        <div><h2>Stay connected</h2><Link to="/items">Lost &amp; found</Link><Link to="/saved-interests">Saved interests</Link><Link to="/search">Search campus information</Link></div>
        <div className="footer-note"><Icon name="location" size={18} /><div><strong>Kyungdong University</strong><p>Global Campus · South Korea</p><span>All times shown in Asia/Seoul (KST).</span></div></div>
      </div>
      <div className="container footer-bottom"><span>© {new Date().getFullYear()} KDU Global · University Information Display System</span><span>Sample records are fictional. Campus artwork is illustrative.</span></div>
    </footer>
  );
}
