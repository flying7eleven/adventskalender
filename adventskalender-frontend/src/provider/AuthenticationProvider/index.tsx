import { useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthenticationContext } from '../../hooks/useAuthentication';
import { API_BACKEND_URL } from '../../api';
import { SessionInformationSchema } from '../../schemas';

export const AuthenticationProvider = ({ children }: { children: ReactNode }) => {
    // Remove token state - authentication is now server-side via httpOnly cookies
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [expiresIn, setExpiresIn] = useState<number | null>(null);
    const applySessionInformation = (data: unknown) => {
        const sessionInformation = SessionInformationSchema.parse(data);
        setExpiresIn(sessionInformation.expires_in);
        return sessionInformation.expires_in;
    };

    // Check authentication status on mount by calling /auth/me
    useEffect(() => {
        fetch(`${API_BACKEND_URL}/auth/me`, {
            method: 'GET',
            credentials: 'include', // Include httpOnly cookie
        })
            .then((response) => {
                if (response.ok) {
                    setIsAuthenticated(true);
                    return response
                        .json()
                        .then(applySessionInformation)
                        .catch(() => undefined);
                }
                setIsAuthenticated(false);
                setExpiresIn(null);
            })
            .catch(() => {
                setIsAuthenticated(false);
                setExpiresIn(null);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    const signin = (username: string, password: string, successCallback: VoidFunction, failCallback: VoidFunction, rateLimitCallback?: (waitTimeSeconds: number) => void) => {
        const requestData = {
            username,
            password,
        };

        fetch(`${API_BACKEND_URL}/auth/token`, {
            method: 'POST',
            body: JSON.stringify(requestData),
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
            credentials: 'include', // CRITICAL: Send cookies with request
        })
            .then((response) => {
                if (response.ok) {
                    return response.json();
                }
                if (response.status === 429) {
                    const retryAfter = Number.parseInt(response.headers.get('Retry-After') || '0', 10);
                    return Promise.reject({ rateLimited: true, retryAfter: Number.isNaN(retryAfter) ? 0 : retryAfter });
                }
                return Promise.reject();
            })
            .then((data) => {
                applySessionInformation(data);
                setIsAuthenticated(true);
                successCallback();
            })
            .catch((reason: unknown) => {
                setIsAuthenticated(false);
                if (reason !== null && typeof reason === 'object' && 'rateLimited' in reason && reason.rateLimited === true && rateLimitCallback) {
                    const retryAfter = 'retryAfter' in reason && typeof reason.retryAfter === 'number' ? reason.retryAfter : 0;
                    rateLimitCallback(Number.isNaN(retryAfter) ? 0 : retryAfter);
                } else {
                    failCallback();
                }
            });
    };

    const signout = (callback: VoidFunction) => {
        fetch(`${API_BACKEND_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        })
            .then(() => {
                setIsAuthenticated(false);
                setExpiresIn(null);
                callback();
            })
            .catch(() => {
                // Even if logout fails, clear local state
                setIsAuthenticated(false);
                setExpiresIn(null);
                callback();
            });
    };

    const refresh = useCallback((successCallback: (expiresIn: number) => void, failCallback: VoidFunction) => {
        fetch(`${API_BACKEND_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        })
            .then((response) => {
                if (response.status === 200) {
                    return response
                        .json()
                        .then(applySessionInformation)
                        .catch(() => Promise.reject());
                }
                return Promise.reject();
            })
            .then((expiresIn) => {
                successCallback(expiresIn);
            })
            .catch(() => {
                failCallback();
            });
    }, []);

    const value = { isAuthenticated, isLoading, expiresIn, signin, signout, refresh };

    return <AuthenticationContext.Provider value={value}>{children}</AuthenticationContext.Provider>;
};
