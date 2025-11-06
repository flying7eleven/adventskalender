import { createContext, useContext } from 'react';

interface AuthContextType {
    isAuthenticated: boolean;
    signin: (user: string, password: string, successCallback: VoidFunction, failCallback: VoidFunction, rateLimitCallback?: (waitTime: number) => void) => void;
    signout: (callback: VoidFunction) => void;
}

export const AuthenticationContext = createContext<AuthContextType>(null!);

export const useAuthentication = () => {
    return useContext(AuthenticationContext);
};

// Note: getUsernameFromToken removed - token no longer accessible client-side
// Username can be fetched from backend via /auth/me endpoint if needed
