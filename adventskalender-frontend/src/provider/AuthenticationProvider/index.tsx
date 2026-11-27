import { useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthenticationContext, type SigninCallbacks } from '../../hooks/useAuthentication';
import { ApiAuthExpiredError, ApiResponseError, apiFetch } from '../../api';
import { SessionInformationSchema } from '../../schemas';

export const AuthenticationProvider = ({ children }: { children: ReactNode }) => {
    // Remove token state - authentication is now server-side via httpOnly cookies
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [expiresIn, setExpiresIn] = useState<number | null>(null);

    // Check authentication status on mount by calling /auth/me
    useEffect(() => {
        apiFetch('/auth/me', SessionInformationSchema)
            .then((sessionInformation) => {
                setIsAuthenticated(true);
                setExpiresIn(sessionInformation.expires_in);
            })
            .catch(() => {
                setIsAuthenticated(false);
                setExpiresIn(null);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    const signin = (username: string, password: string, callbacks: SigninCallbacks) => {
        const requestData = {
            username,
            password,
        };

        // the rejection handler sits beside the success handler so that a throwing
        // onSuccess is never reported as a failed login
        apiFetch('/auth/token', SessionInformationSchema, { method: 'POST', body: requestData }).then(
            (sessionInformation) => {
                setExpiresIn(sessionInformation.expires_in);
                setIsAuthenticated(true);
                callbacks.onSuccess();
            },
            (error: unknown) => {
                setIsAuthenticated(false);
                setExpiresIn(null);
                if (error instanceof ApiAuthExpiredError && error.status === 401) {
                    callbacks.onInvalidCredentials();
                } else if (error instanceof ApiResponseError && error.status === 429) {
                    const retryAfter = Number.parseInt(error.response.headers.get('Retry-After') || '0', 10);
                    callbacks.onRateLimited(Number.isNaN(retryAfter) ? 0 : retryAfter);
                } else {
                    callbacks.onError();
                }
            }
        );
    };

    const signout = (callback: VoidFunction) => {
        apiFetch('/auth/logout', { method: 'POST' })
            // Even if logout fails, clear local state
            .catch(() => undefined)
            .then(() => {
                setIsAuthenticated(false);
                setExpiresIn(null);
                callback();
            });
    };

    const refresh = useCallback((successCallback: (expiresIn: number) => void, failCallback: VoidFunction) => {
        apiFetch('/auth/refresh', SessionInformationSchema, { method: 'POST' })
            .then((sessionInformation) => {
                setExpiresIn(sessionInformation.expires_in);
                successCallback(sessionInformation.expires_in);
            })
            .catch(() => {
                failCallback();
            });
    }, []);

    const value = { isAuthenticated, isLoading, expiresIn, signin, signout, refresh };

    return <AuthenticationContext.Provider value={value}>{children}</AuthenticationContext.Provider>;
};
