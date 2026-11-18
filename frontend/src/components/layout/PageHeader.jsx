import { useEffect } from 'react';

export default function PageHeader({ title, description, actions, breadcrumb }) {
  useEffect(() => {
    document.title = `${title} - KDU Global UIDS`;
  }, [title]);
  return (
    <div className="page-header">
      {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
      <div className="row-between">
        <h1 style={{ margin: 0 }}>{title}</h1>
        {actions && <div className="row">{actions}</div>}
      </div>
      {description && <p>{description}</p>}
    </div>
  );
}
