import { useAuthentication } from '../../hooks/useAuthentication';
import { Navigate, useLocation } from 'react-router-dom';

export const RequireAuthentication = ({ children }: { children: JSX.Element }) => {
    const auth = useAuthentication();
    const location = useLocation();

    if (!auth.token.accessToken || !auth.token.accessToken.length) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to when they were redirected. This allows us to send them
        // along to that page after they login, which is a nicer user experience
        // than dropping them off on the home page.
        return <Navigate to="/login" state={{ from: location }} />;
    }

    return children;
};
