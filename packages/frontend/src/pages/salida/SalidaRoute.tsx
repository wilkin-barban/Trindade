import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../../components/ui/loading-spinner';
import { isSalidaVisible } from '../../lib/salida';

/**
 * The gate of the two routes: a session, and nothing else.
 *
 * The beta that used to keep everybody but one account out is over, so the only refusal left is anonymity -- a
 * bookmark typed by hand without a session lands on the login instead of on a module that would answer 401.
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

  if (!isSalidaVisible(user)) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
