import { useCallback, useState } from 'react';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';

const PHOTOS = [
  { file: 'hero-06.jpg', title: 'A community of cultures', alt: 'Students in traditional clothing at an outdoor cultural celebration, from the KDU website' },
  { file: 'hero-04.jpg', title: 'Room for conversation', alt: 'A group of students and staff in discussion indoors, from the KDU website' },
  { file: 'hero-03.jpg', title: 'A moment to celebrate', alt: 'A graduate receiving an award at a university ceremony, from the KDU website' },
  { file: 'hero-02.jpg', title: 'Connections across borders', alt: 'Delegates seated at an international university gathering, from the KDU website' },
  { file: 'hero-01.jpg', title: 'The next chapter begins', alt: 'A speaker addressing a university graduation ceremony, from the KDU website' },
  { file: 'hero-05.jpg', title: 'Ideas that bring us together', alt: 'A university speaker at a lectern beside flags, from the KDU website' },
];

export default function UniversityGallery() {
  const [index, setIndex] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const closeVideo = useCallback(() => setVideoOpen(false), []);
  const photo = PHOTOS[index];
  const shift = (direction) => setIndex((current) => (current + direction + PHOTOS.length) % PHOTOS.length);

  return (
    <section className="kdu-discover content-section" aria-labelledby="kdu-discover-title">
      <div className="section-heading">
        <div><p className="eyebrow">THE PEOPLE. THE MOMENTS. THE POSSIBILITIES.</p><h2 id="kdu-discover-title">Campus in focus</h2></div>
        <a className="section-link" href="https://kduniv.ac.kr/global/Main.do" target="_blank" rel="noopener noreferrer">Discover KDU<Icon name="arrowRight" size={16} /><span className="visually-hidden"> (opens in a new tab)</span></a>
      </div>
      <div className="kdu-discover-grid">
        <figure className="kdu-gallery" aria-label="University photo gallery">
          <img src={`/assets/kdu/originals/${photo.file}`} alt={photo.alt} width="1920" height="860" loading="lazy" decoding="async" />
          <figcaption>
            <div><span className="kdu-photo-credit">PHOTOGRAPHY FROM KDU</span><strong aria-live="polite">{photo.title}</strong></div>
            <div className="kdu-gallery-controls">
              <span aria-label={`Photo ${index + 1} of ${PHOTOS.length}`}>{String(index + 1).padStart(2, '0')}<span aria-hidden="true"> / {String(PHOTOS.length).padStart(2, '0')}</span></span>
              <button type="button" onClick={() => shift(-1)} aria-label="Previous university photo"><Icon name="chevronLeft" size={18} /></button>
              <button type="button" onClick={() => shift(1)} aria-label="Next university photo"><Icon name="chevronRight" size={18} /></button>
            </div>
          </figcaption>
        </figure>
        <article className="kdu-video-card">
          <button className="kdu-video-link" type="button" onClick={() => setVideoOpen(true)} aria-label="Play KDU official video">
            <img src="/assets/kdu/originals/hero-04.jpg" alt="" width="1920" height="860" loading="lazy" decoding="async" />
            <span className="kdu-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
            <span className="kdu-video-label">WATCH THE KDU FILM<Icon name="arrowRight" size={20} /></span>
          </button>
          <div className="kdu-video-copy"><p className="eyebrow">A CLOSER LOOK</p><h3>See where it begins.</h3><p>Discover the university through its official video.</p><a className="section-link" href="https://www.youtube.com/watch?v=HL4dlG7BPeM" target="_blank" rel="noopener noreferrer">Watch on YouTube<Icon name="arrowRight" size={16} /><span className="visually-hidden"> (opens in a new tab)</span></a></div>
        </article>
      </div>
      <Modal open={videoOpen} onClose={closeVideo} title="KDU Global — official university film" wide>
        <video className="kdu-film" controls autoPlay playsInline preload="metadata" tabIndex={0} aria-label="KDU Global 2027 official university film">
          <source src="/assets/kdu/originals/official-kdu-video.mp4" type="video/mp4" />
          Your browser cannot play this video. <a href="https://www.youtube.com/watch?v=HL4dlG7BPeM" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>.
        </video>
        <p className="kdu-film-credit">KDU Global 2027: We lead the world with new traditions! · Film by KDU Global</p>
      </Modal>
    </section>
  );
}
