import { useState } from 'react';
import jwt, { decode } from 'jsonwebtoken';
import { AccessToken } from '../../api';

export const useToken = () => {
    const [token, setToken] = useState<AccessToken>(() => {
        const tokenSessionStorage = window.sessionStorage.getItem('adventskalender:token');
        if (tokenSessionStorage) {
            return JSON.parse(tokenSessionStorage);
        }
        return { accessToken: '' };
    });

    const isTokenValid = () => {
        // if no access token is stored, the token cannot be valid ;)
        if (token.accessToken.length === 0) {
            return false;
        }

        // try to decode the token
        try {
            jwt.decode(token.accessToken, {
                complete: true,
                json: true,
            });
        } catch (_) {
            invalidateToken(); // if decoding the token failed, remove the locally stored token
            return false;
        }

        // if we reach this step, the token is valid and we can continue
        return true;
    };

    const invalidateToken = () => {
        setToken({ accessToken: '' });
        window.sessionStorage.removeItem('adventskalender:token');
    };

    const storeNewToken = (token: AccessToken) => {
        setToken(token);
        window.sessionStorage.setItem('adventskalender:token', JSON.stringify(token));
    };

    return { isTokenValid, invalidateToken, storeNewToken };
};
