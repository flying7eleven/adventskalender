import { useState, useEffect, createContext, useCallback, useContext, ReactNode } from 'react';
import * as React from 'react';
import { AuthenticationContext } from '../../hooks/useAuthentication';
import { API_BACKEND_URL } from '../../api';
import { SessionExpiresAtSchema } from '../../schemas';

interface AuthenticationContextValue extends React.ContextType<typeof AuthenticationContext> {
    expiresAt: number | null;
}

export const AuthenticationExpiryContext = createContext<AuthenticationContextValue>(null!);

export const AuthenticationProvider = ({ children }: { children: ReactNode }) => {
    // Remove token state - authentication is now server-side via httpOnly cookies
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [expiresAt, setExpiresAt] = useState<number | null>(null);
    const applySessionInformation = (data: unknown) => {
        const sessionInformation = SessionExpiresAtSchema.parse(data);
        setExpiresAt(sessionInformation.expires_at * 1000);
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
                setExpiresAt(null);
            })
            .catch(() => {
                setIsAuthenticated(false);
                setExpiresAt(null);
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
                if (response.status === 204) {
                    return response;
                }
                if (response.status === 429) {
                    const retryAfter = Number.parseInt(response.headers.get('Retry-After') || '0', 10);
                    return Promise.reject({ rateLimited: true, retryAfter: Number.isNaN(retryAfter) ? 0 : retryAfter });
                }
                return Promise.reject();
            })
            .then(() => {
                // The backend re-issued the cookie: fetch the fresh expiry so the
                // session manager schedules against the real expiry
                fetch(`${API_BACKEND_URL}/auth/me`, {
                    method: 'GET',
                    credentials: 'include',
                })
                    .then((response) => {
                        if (response.ok) {
                            return response
                                .json()
                                .then(applySessionInformation)
                                .catch(() => undefined);
                        }
                        setExpiresAt(null);
                    })
                    .catch(() => setExpiresAt(null));
                setIsAuthenticated(true);
                successCallback();
            })
            .catch((reason: unknown) => {
                setIsAuthenticated(false);
                const rateLimited = typeof reason === 'object' && reason !== null && 'rateLimited' in reason && (reason as { rateLimited: unknown }).rateLimited === true;
                if (rateLimited && rateLimitCallback) {
                    const retryAfter = typeof reason === 'object' && reason !== null && 'retryAfter' in reason ? Number((reason as { retryAfter: unknown }).retryAfter) : 0;
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
                setExpiresAt(null);
                callback();
            })
            .catch(() => {
                // Even if logout fails, clear local state
                setIsAuthenticated(false);
                setExpiresAt(null);
                callback();
            });
    };

    const refresh = useCallback((successCallback: VoidFunction, failCallback: VoidFunction) => {
        fetch(`${API_BACKEND_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        })
            .then((response) => {
                if (response.status === 200) {
                    return response
                        .json()
                        .then(applySessionInformation)
                        .catch(() => undefined);
                }
                return Promise.reject();
            })
            .then(() => {
                successCallback();
            })
            .catch(() => {
                failCallback();
            });
    }, []);

    const value = { isAuthenticated, isLoading, expiresAt, signin, signout, refresh };

    return (
        <AuthenticationExpiryContext.Provider value={value}>
            <AuthenticationContext.Provider value={value}>{children}</AuthenticationContext.Provider>
        </AuthenticationExpiryContext.Provider>
    );
};

export const useAuthenticationExpiry = () => {
    return useContext(AuthenticationExpiryContext);
};
