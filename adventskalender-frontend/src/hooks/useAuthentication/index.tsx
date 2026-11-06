import { createContext, useContext } from 'react';

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    expiresIn: number | null;
    signin: (user: string, password: string, successCallback: VoidFunction, failCallback: VoidFunction, rateLimitCallback?: (waitTimeSeconds: number) => void) => void;
    signout: (callback: VoidFunction) => void;
    refresh: (successCallback: (expiresIn: number) => void, failCallback: VoidFunction) => void;
}

export const AuthenticationContext = createContext<AuthContextType>(null!);

export const useAuthentication = () => {
    return useContext(AuthenticationContext);
};
