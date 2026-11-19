import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';
import { TypeTag, ItemStatusBadge } from './LfBadges';
import LfCategoryIcon from './LfCategoryIcon';
import { publicPhotoUrl } from '../../api/lostFound';
import { lfLabel, postedDate } from '../../lib/lostFoundLabels';

/** Public item card: photo first, only public fields are ever passed in. */
export default function ItemCard({ item }) {
  const photo = item.photoIds && item.photoIds[0];
  return (
    <article className={`lf-card lf-${item.type}`}>
      <div className="lf-card-media">
        {photo ? <img src={publicPhotoUrl(item.id, photo)} alt="" loading="lazy" /> : <LfCategoryIcon category={item.category} size={56} />}
        <TypeTag type={item.type} />
        {item.status !== 'OPEN' && <ItemStatusBadge status={item.status} />}
      </div>
      <div className="lf-card-body">
        <span className="small muted" style={{ fontWeight: 600 }}>
          {lfLabel(item.category)}
        </span>
        <h3>
          <Link to={`/lost-found/items/${item.id}`}>{item.title}</Link>
        </h3>
        <div className="lf-card-meta">
          <span>
            <Icon name="location" size={14} /> {item.location}
          </span>
          <span>
            <Icon name="clock" size={14} /> {postedDate(item.postedAt)}
          </span>
        </div>
      </div>
    </article>
  );
}
