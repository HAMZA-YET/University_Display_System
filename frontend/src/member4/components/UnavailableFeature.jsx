import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { EmptyState } from '../../components/ui/States.jsx';

export default function UnavailableFeature({ title, message }) {
  return (
    <>
      <PageHeader title={title} description={message} />
      <EmptyState title="Service not connected">
        <p>No records or personal changes are available here.</p>
        <Link className="btn btn-secondary" to="/search">Search campus information</Link>
      </EmptyState>
    </>
  );
}
