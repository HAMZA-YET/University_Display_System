import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';

export default function NotFound() {
  return (
    <div className="stack">
      <PageHeader title="Page not found" description="The page or notice you are looking for does not exist or is not available." />
      <p>If you followed a link to a notice, it may not be published yet, or it may have expired or been withdrawn.</p>
      <div className="row">
        <Button to="/notices" icon="list">
          Browse notices
        </Button>
        <Button to="/" variant="secondary">
          Go to the home page
        </Button>
      </div>
    </div>
  );
}
