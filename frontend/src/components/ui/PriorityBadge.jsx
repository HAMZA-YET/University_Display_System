import Icon from './Icon';

export default function PriorityBadge({ priority, pinned, showNormal = false }) {
  return (
    <>
      {pinned && (
        <span className="badge badge-outline">
          <Icon name="pin" size={12} /> PINNED
        </span>
      )}
      {priority && (priority !== 'NORMAL' || showNormal) && (
        <span className={`badge badge-prio-${priority}`}>
          <span className="visually-hidden">Priority: </span>
          {priority}
        </span>
      )}
    </>
  );
}
