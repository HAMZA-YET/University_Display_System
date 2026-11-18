import Icon from './Icon';

const ICONS = { info: 'info', success: 'check', warning: 'alert', error: 'alert' };

/** type: info | success | warning | error */
export default function Alert({ type = 'info', title, children, actions, role }) {
  return (
    <div className={`alert alert-${type}`} role={role || (type === 'error' ? 'alert' : 'status')}>
      <Icon name={ICONS[type]} size={20} />
      <div style={{ flex: 1 }}>
        {title && <div className="alert-title">{title}</div>}
        {children}
        {actions && <div className="row" style={{ marginTop: 'var(--space-3)' }}>{actions}</div>}
      </div>
    </div>
  );
}
