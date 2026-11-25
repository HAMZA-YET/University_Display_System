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
  const [failedSource, setFailedSource] = useState(null);
  const fullName = [professor.titlePrefix, professor.name].filter(Boolean).join(' ');
  const illustrated = professor.profileImage?.startsWith('/assets/avatars/');
  const official = Boolean(professor.sourceKey);
  const sourceUrl = /^https:\/\/(?:www\.)?kduniv\.ac\.kr\//.test(professor.sourceUrl || '') ? professor.sourceUrl : null;
  const roles = (professor.roles || []).filter((role) => role !== professor.positionLabel);
  const subjects = professor.subjects || [];
  const hours = professor.counsellingHours || [];
  const office = [professor.officeRoom && `Room ${professor.officeRoom}`, professor.officeBuilding].filter(Boolean).join(', ');
  const department = departmentName && !/\s\(Demo\)$/i.test(departmentName)
    ? departmentName : professor.departmentName || departmentName || professor.department;
  return (
    <article className={`prof-card${official ? ' prof-card-official' : ''}`}>
      <div className="prof-head">
        {professor.profileImage && professor.profileImage !== failedSource ? (
          <img className="prof-photo" src={professor.profileImage} alt={`${illustrated ? 'Illustration for' : 'Photo of'} ${fullName}`} loading="lazy" width="72" height="72" onError={() => setFailedSource(professor.profileImage)} />
        ) : (
          <InitialsAvatar name={professor.name} />
        )}
        <div>
          <h3>{fullName}</h3>
          <div className="small">{professor.positionLabel || humanize(professor.position)}</div>
          {department && <div className="small muted">{department}</div>}
          {official && <span className="prof-source-badge">KDU Global faculty</span>}
          {/\(Demo\)\s*$/i.test(professor.name) && <span className="sample-badge">Fictional sample profile</span>}
        </div>
      </div>
      {roles.length > 0 && <ul className="prof-roles">{roles.map((role) => <li key={role}>{role}</li>)}</ul>}
      {professor.qualifications?.length > 0 && <div className="prof-detail-section"><h4>Qualifications</h4><ul className="prof-qualifications">{professor.qualifications.map((qualification) => <li key={qualification}>{qualification}</li>)}</ul></div>}
      <dl>
        {office && <><dt>Office</dt><dd>{office}</dd></>}
        <dt>Email</dt>
        <dd>
          {professor.email ? <a href={`mailto:${professor.email}`}>
            <Icon name="mail" size={14} /> {professor.email}
          </a> : <span className="muted">Not published</span>}
        </dd>
        {professor.phone && (
          <>
            <dt>Phone</dt>
            <dd>{professor.phone}</dd>
          </>
        )}
      </dl>
      {(subjects.length > 0 || !official) && <div>
        <div className="small" style={{ fontWeight: 700 }}>
          Subjects
        </div>
        <ul className="small">
          {subjects.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>}
      {(hours.length > 0 || !official) && <div>
        <div className="small" style={{ fontWeight: 700 }}>
          Counselling hours
        </div>
        {hours.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            By appointment only.
          </p>
        ) : (
          <ul className="small">
            {hours.map((h, i) => (
              <li key={i}>
                {dayName(h.day)} {h.startTime}-{h.endTime}
                {h.location ? `, ${h.location}` : ''}
                {h.note ? ` (${h.note})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>}
      {official && <div className="prof-source-note">
        {(!office || !hours.length) && <p>{!office && !hours.length ? 'Office and counselling details are not published.' : !office ? 'Office details are not published.' : 'Counselling hours are not published.'}</p>}
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Official faculty profile<Icon name="arrowRight" size={13} /><span className="visually-hidden"> (opens in a new tab)</span></a>}
      </div>}
    </article>
  );
}
