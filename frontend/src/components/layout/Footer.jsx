import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand"><div><img className="official-university-logo" src="/assets/kdu-official-logo.gif" width="175" height="64" alt="Kyungdong University" /></div><p>Your campus, connected.<br />A student project bringing campus information together.</p></div>
        <div><h2>Explore your campus</h2><Link to="/notices">Campus notices</Link><Link to="/events">Events &amp; activities</Link><Link to="/professors">Professor directory</Link></div>
        <div><h2>Stay connected</h2><Link to="/items">Lost &amp; found</Link><Link to="/saved-interests">Saved interests</Link><Link to="/search?source=all">Search campus information</Link></div>
        <div className="footer-note"><Icon name="location" size={18} /><div><strong>Kyungdong University</strong><p>Global Campus · South Korea</p><span>All times shown in Asia/Seoul (KST).</span></div></div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} University Information Display System · Student project</span>
        <span>Sample records are fictional. Campus photography: <a href="https://kduniv.ac.kr/global/Main.do" target="_blank" rel="noopener noreferrer">Kyungdong University</a>. <a href="https://www.youtube.com/watch?v=HL4dlG7BPeM" target="_blank" rel="noopener noreferrer">Official KDU video</a>.</span>
      </div>
    </footer>
  );
}
