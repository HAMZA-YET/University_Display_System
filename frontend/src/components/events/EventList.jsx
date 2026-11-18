import EventCard from './EventCard';
import EmptyState from '../ui/EmptyState';

export default function EventList({ events }) {
  if (!events.length) return <EmptyState title="No events in this view">Try another tab or month.</EmptyState>;
  return (
    <div className="grid grid-2">
      {events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}
