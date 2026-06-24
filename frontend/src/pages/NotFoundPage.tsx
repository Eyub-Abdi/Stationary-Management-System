import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon="explore_off"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
      action={
        <Button icon="home" onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
      }
      className="py-24"
    />
  );
}
