import { useState, useEffect } from 'react';
import * as React from 'react';
import { AuthenticationContext } from '../../hooks/useAuthentication';
import { API_BACKEND_URL } from '../../api';
import { rateLimiter } from '../../utils/RateLimiter';

export const AuthenticationProvider = ({ children }: { children: React.ReactNode }) => {
    // Remove token state - authentication is now server-side via httpOnly cookies
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Check authentication status on mount by calling /auth/me
    useEffect(() => {
        fetch(`${API_BACKEND_URL}/auth/me`, {
            method: 'GET',
            credentials: 'include', // Include httpOnly cookie
        })
            .then((response) => {
                if (response.ok) {
                    setIsAuthenticated(true);
                } else {
                    setIsAuthenticated(false);
                }
            })
            .catch(() => {
                setIsAuthenticated(false);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    const signin = (username: string, password: string, successCallback: VoidFunction, failCallback: VoidFunction, rateLimitCallback?: (waitTime: number) => void) => {
        const key = `login:${username}`;

        // Check if rate limit allows this attempt
        if (!rateLimiter.canAttempt(key)) {
            const waitTime = rateLimiter.getWaitTime(key);
            if (rateLimitCallback) {
                rateLimitCallback(waitTime);
            }
            return;
        }

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
                if (response.status !== 204) {
                    return Promise.reject();
                }
                return response;
            })
            .then(() => {
                // Success - clear rate limit tracking
                rateLimiter.recordAttempt(key, true);
                setIsAuthenticated(true);
                successCallback();
            })
            .catch(() => {
                // Failure - record failed attempt for rate limiting
                rateLimiter.recordAttempt(key, false);
                setIsAuthenticated(false);
                failCallback();
            });
    };

    const signout = (callback: VoidFunction) => {
        fetch(`${API_BACKEND_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        })
            .then(() => {
                setIsAuthenticated(false);
                callback();
            })
            .catch(() => {
                // Even if logout fails, clear local state
                setIsAuthenticated(false);
                callback();
            });
    };

    const value = { isAuthenticated, isLoading, signin, signout };

    return <AuthenticationContext.Provider value={value}>{children}</AuthenticationContext.Provider>;
};
