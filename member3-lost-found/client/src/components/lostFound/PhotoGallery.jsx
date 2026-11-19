import { useState } from 'react';
import LfCategoryIcon from './LfCategoryIcon';

/**
 * Shows an item's photos with thumbnails. urlFor(photoId) decides which route
 * is used (public, or the private reporter/officer route).
 */
export default function PhotoGallery({ photoIds = [], urlFor, category, title }) {
  const [index, setIndex] = useState(0);
  const current = photoIds[Math.min(index, photoIds.length - 1)];
  return (
    <div className="lf-gallery">
      <div className="lf-gallery-main">
        {current ? <img src={urlFor(current)} alt={`Photo of ${title}`} /> : <LfCategoryIcon category={category} size={88} />}
      </div>
      {photoIds.length > 1 && (
        <div className="lf-thumbs" role="group" aria-label="Choose photo">
          {photoIds.map((id, i) => (
            <button
              key={id}
              type="button"
              className="lf-thumb"
              aria-pressed={i === index}
              aria-label={`Photo ${i + 1}`}
              onClick={() => setIndex(i)}
            >
              <img src={urlFor(id)} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
