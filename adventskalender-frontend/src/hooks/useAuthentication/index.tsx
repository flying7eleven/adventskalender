import { createContext, useContext } from 'react';

export interface SigninCallbacks {
    onSuccess: VoidFunction;
    onInvalidCredentials: VoidFunction;
    onRateLimited: (waitTimeSeconds: number) => void;
    onError: VoidFunction;
}

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    expiresIn: number | null;
    signin: (user: string, password: string, callbacks: SigninCallbacks) => void;
    signout: (callback: VoidFunction) => void;
    refresh: (successCallback: (expiresIn: number) => void, failCallback: VoidFunction) => void;
}

export const AuthenticationContext = createContext<AuthContextType>(null!);

export const useAuthentication = () => {
    return useContext(AuthenticationContext);
};
