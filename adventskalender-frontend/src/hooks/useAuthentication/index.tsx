import { createContext, useContext } from 'react';
import { AccessToken } from '../../api';

interface AuthContextType {
    token: AccessToken;
    signin: (user: string, password: string, callback: VoidFunction) => void;
    signout: (callback: VoidFunction) => void;
}

export const AuthenticationContext = createContext<AuthContextType>(null!);

export const useAuthentication = () => {
    return useContext(AuthenticationContext);
};
