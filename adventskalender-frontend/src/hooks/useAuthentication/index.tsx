import { createContext, useContext } from 'react';
import { AccessToken } from '../../api';
import { decodeJwt } from 'jose';

interface AuthContextType {
    token: AccessToken;
    signin: (user: string, password: string, successCallback: VoidFunction, failCallback: VoidFunction) => void;
    signout: (callback: VoidFunction) => void;
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const AuthenticationContext = createContext<AuthContextType>(null!);

export const useAuthentication = () => {
    return useContext(AuthenticationContext);
};

export const getUsernameFromToken = (token: string): string => {
    let decodedToken = decodeJwt(token);
    return decodedToken.sub ? decodedToken.sub : 'unknown';
};
