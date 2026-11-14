import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { isSalidaVisible } from '../../lib/salida';

/**
 * The gate of the private beta, above the two routes and nothing else.
 *
 * The server is the authority: every `/api/salida*` route and the `saida` bridge action answer 403 to anybody
 * but `wilkin`. This gate exists so the other roles never see a screen the server would refuse them, and so a
 * bookmark typed by hand lands on the dashboard instead of on an empty module with an error on it.
 */
export function SalidaRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isSalidaVisible(user)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
