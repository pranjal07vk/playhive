import { ErrorState } from '../components/feedback/States.jsx';

export default function NotFoundPage() {
  return (
    <div className="container page">
      <ErrorState title="This page wandered off." message="The link might be broken, or the page never existed." />
    </div>
  );
}
