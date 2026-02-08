import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';

export function PlaceholderPage() {
  const location = useLocation();
  const pageName = location.pathname.split('/')[1] || 'Page';

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="p-4 bg-steel rounded-lg mb-4">
          <Construction className="h-12 w-12 text-muted" />
        </div>
        <h1 className="text-xl font-semibold text-foreground capitalize">
          {pageName}
        </h1>
        <p className="text-secondary mt-2">
          This page is under construction
        </p>
      </div>
    </div>
  );
}
