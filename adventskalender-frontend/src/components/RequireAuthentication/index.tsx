import { useAuthentication } from '../../hooks/useAuthentication';
import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

export const RequireAuthentication = ({ children }: { children: ReactNode }) => {
    const auth = useAuthentication();
    const location = useLocation();

    // Wait for authentication check to complete
    if (auth.isLoading) {
        return null; // or a loading spinner
    }

    if (!auth.isAuthenticated) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to when they were redirected. This allows us to send them
        // along to that page after they login, which is a nicer user experience
        // than dropping them off on the home page.
        return <Navigate to="/login" state={{ from: location }} />;
    }

    return children;
};
