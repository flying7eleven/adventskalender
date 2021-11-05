import React, { useState } from 'react';
import { AuthenticationContext } from '../../hooks/useAuthentication';
import { AccessToken, API_BACKEND_URL } from '../../api';

export const AuthenticationProvider = ({ children }: { children: React.ReactNode }) => {
    const [token, setToken] = useState<AccessToken>(() => {
        const tokenSessionStorage = window.sessionStorage.getItem('adventskalender:token');
        if (tokenSessionStorage) {
            return JSON.parse(tokenSessionStorage);
        }
        return { accessToken: '' };
    });

    const signin = (username: string, password: string, callback: VoidFunction) => {
        // prepare the data for the authentication request
        const requestData = {
            username,
            password,
        };

        // try to get the token from the backend with the supplied information
        fetch(`${API_BACKEND_URL}/auth/token`, {
            method: 'POST',
            body: JSON.stringify(requestData),
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((response) => response.json())
            .then((receivedToken: AccessToken) => {
                setToken(receivedToken);
                window.sessionStorage.setItem('adventskalender:token', JSON.stringify(receivedToken));
                callback();
            });
    };

    const signout = (callback: VoidFunction) => {
        setToken({ accessToken: '' });
        window.sessionStorage.removeItem('adventskalender:token');
        callback();
    };

    const value = { token, signin, signout };

    return <AuthenticationContext.Provider value={value}>{children}</AuthenticationContext.Provider>;
};
