import { useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthenticationContext } from '../../hooks/useAuthentication';
import { ApiResponseError, ApiSchemaError, apiFetch } from '../../api';
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
            .catch((error: unknown) => {
                // the session cookie was accepted, only its remaining lifetime is unknown
                if (error instanceof ApiSchemaError) {
                    setIsAuthenticated(true);
                    return;
                }
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

        apiFetch('/auth/token', SessionInformationSchema, { method: 'POST', body: requestData })
            .then((sessionInformation) => {
                setExpiresIn(sessionInformation.expires_in);
                setIsAuthenticated(true);
                successCallback();
            })
            .catch((error: unknown) => {
                setIsAuthenticated(false);
                if (error instanceof ApiResponseError && error.status === 429 && rateLimitCallback) {
                    const retryAfter = Number.parseInt(error.response.headers.get('Retry-After') || '0', 10);
                    rateLimitCallback(Number.isNaN(retryAfter) ? 0 : retryAfter);
                } else {
                    failCallback();
                }
            });
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
