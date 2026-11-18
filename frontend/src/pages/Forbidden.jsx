import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';

export default function Forbidden() {
  return (
    <div className="stack">
      <PageHeader title="Access denied" description="Your account does not have permission to open this page." />
      <p>If you think you should have access, ask an administrator to check your role.</p>
      <Button to="/" variant="secondary">
        Go to the home page
      </Button>
    </div>
  );
}
