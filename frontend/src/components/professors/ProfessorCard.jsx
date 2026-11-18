import { useState } from 'react';
import Icon from '../ui/Icon';
import { humanize, dayName } from '../../lib/labels';

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

/** SVG initials placeholder used when there is no profile photo. */
export function InitialsAvatar({ name, size = 72 }) {
  return (
    <svg className="prof-photo" width={size} height={size} viewBox="0 0 72 72" role="img" aria-label={`Initials of ${name}`}>
      <rect width="72" height="72" fill="#0b2545" />
      <text x="36" y="44" textAnchor="middle" fill="#ffffff" fontFamily="Arial, sans-serif" fontSize="26" fontWeight="700">
        {initials(name)}
      </text>
    </svg>
  );
}

export default function ProfessorCard({ professor, departmentName }) {
  const [imgFailed, setImgFailed] = useState(false);
  const fullName = [professor.titlePrefix, professor.name].filter(Boolean).join(' ');
  return (
    <article className="prof-card">
      <div className="prof-head">
        {professor.profileImage && !imgFailed ? (
          <img className="prof-photo" src={professor.profileImage} alt={`Photo of ${fullName}`} onError={() => setImgFailed(true)} />
        ) : (
          <InitialsAvatar name={professor.name} />
        )}
        <div>
          <h3>{fullName}</h3>
          <div className="small">{humanize(professor.position)}</div>
          <div className="small muted">{departmentName || professor.department}</div>
        </div>
      </div>
      <dl>
        <dt>Office</dt>
        <dd>
          Room {professor.officeRoom}, {professor.officeBuilding}
        </dd>
        <dt>Email</dt>
        <dd>
          <a href={`mailto:${professor.email}`}>
            <Icon name="mail" size={14} /> {professor.email}
          </a>
        </dd>
        {professor.phone && (
          <>
            <dt>Phone</dt>
            <dd>{professor.phone}</dd>
          </>
        )}
      </dl>
      <div>
        <div className="small" style={{ fontWeight: 700 }}>
          Subjects
        </div>
        <ul className="small">
          {professor.subjects.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="small" style={{ fontWeight: 700 }}>
          Counselling hours
        </div>
        {professor.counsellingHours.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            By appointment only.
          </p>
        ) : (
          <ul className="small">
            {professor.counsellingHours.map((h, i) => (
              <li key={i}>
                {dayName(h.day)} {h.startTime}-{h.endTime}
                {h.location ? `, ${h.location}` : ''}
                {h.note ? ` (${h.note})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
