import { render, waitFor } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { AuthenticationProvider } from './index';
import { useAuthentication, type SigninCallbacks } from '../../hooks/useAuthentication';
import { API_BACKEND_URL } from '../../api';

type SigninFn = (user: string, password: string, callbacks: SigninCallbacks) => void;

interface ProbeState {
    signin: SigninFn | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    expiresIn: number | null;
}

const renderProbe = () => {
    const state: ProbeState = { signin: null, isAuthenticated: false, isLoading: true, expiresIn: null };
    const ProbeComponent = () => {
        const auth = useAuthentication();
        state.signin = auth.signin;
        state.isAuthenticated = auth.isAuthenticated;
        state.isLoading = auth.isLoading;
        state.expiresIn = auth.expiresIn;
        return null;
    };
    render(
        <AuthenticationProvider>
            <ProbeComponent />
        </AuthenticationProvider>
    );
    return state;
};

const jsonResponse = (body: unknown, status = 200) => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) }) as unknown as Response;

const mockFetch = (tokenResponse: () => Promise<Response>, meResponse: () => Promise<Response> = () => Promise.resolve(jsonResponse({}, 401))) => {
    global.fetch = vi.fn().mockImplementation((url: RequestInfo | URL) => {
        if (String(url) === `${API_BACKEND_URL}/auth/token`) {
            return tokenResponse();
        }
        return meResponse();
    });
};

const signinCallbacks = () => ({
    onSuccess: vi.fn(),
    onInvalidCredentials: vi.fn(),
    onRateLimited: vi.fn(),
    onError: vi.fn(),
});

const renderReadyProbe = async () => {
    const probe = renderProbe();
    await waitFor(() => expect(probe.isLoading).toBe(false));
    return probe;
};

describe('AuthenticationProvider session check', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('is authenticated with the reported expiry when /auth/me returns valid session information', async () => {
        mockFetch(
            () => Promise.resolve(jsonResponse({}, 401)),
            () => Promise.resolve(jsonResponse({ username: 'test', expires_in: 120 }))
        );

        const probe = await renderReadyProbe();

        expect(probe.isAuthenticated).toBe(true);
        expect(probe.expiresIn).toBe(120);
    });

    test('is not authenticated when /auth/me returns a body that does not match the schema', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockFetch(
            () => Promise.resolve(jsonResponse({}, 401)),
            () => Promise.resolve(jsonResponse({ username: 'test' }))
        );

        const probe = await renderReadyProbe();

        expect(probe.isAuthenticated).toBe(false);
        expect(probe.expiresIn).toBeNull();
    });

    test('is not authenticated when /auth/me rejects the session', async () => {
        mockFetch(() => Promise.resolve(jsonResponse({}, 401)));

        const probe = await renderReadyProbe();

        expect(probe.isAuthenticated).toBe(false);
        expect(probe.expiresIn).toBeNull();
    });
});

describe('AuthenticationProvider signin', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('reports the Retry-After seconds to the rate limit callback on 429', async () => {
        mockFetch(() =>
            Promise.resolve({
                status: 429,
                ok: false,
                headers: new Headers({ 'Retry-After': '42' }),
            } as unknown as Response)
        );
        const probe = await renderReadyProbe();

        const callbacks = signinCallbacks();
        probe.signin!('user', 'password', callbacks);

        await waitFor(() => expect(callbacks.onRateLimited).toHaveBeenCalledWith(42));
        expect(callbacks.onSuccess).not.toHaveBeenCalled();
        expect(callbacks.onInvalidCredentials).not.toHaveBeenCalled();
        expect(callbacks.onError).not.toHaveBeenCalled();
    });

    test('reports invalid credentials when the backend rejects them with 401', async () => {
        mockFetch(() => Promise.resolve(jsonResponse({}, 401)));
        const probe = await renderReadyProbe();

        const callbacks = signinCallbacks();
        probe.signin!('user', 'wrong-password', callbacks);

        await waitFor(() => expect(callbacks.onInvalidCredentials).toHaveBeenCalledTimes(1));
        expect(callbacks.onRateLimited).not.toHaveBeenCalled();
        expect(callbacks.onSuccess).not.toHaveBeenCalled();
        expect(callbacks.onError).not.toHaveBeenCalled();
        expect(probe.isAuthenticated).toBe(false);
    });

    test('reports an error instead of invalid credentials when the backend forbids the login with 403', async () => {
        mockFetch(() => Promise.resolve(jsonResponse({}, 403)));
        const probe = await renderReadyProbe();

        const callbacks = signinCallbacks();
        probe.signin!('user', 'password', callbacks);

        await waitFor(() => expect(callbacks.onError).toHaveBeenCalledTimes(1));
        expect(callbacks.onInvalidCredentials).not.toHaveBeenCalled();
        expect(callbacks.onRateLimited).not.toHaveBeenCalled();
        expect(callbacks.onSuccess).not.toHaveBeenCalled();
        expect(probe.isAuthenticated).toBe(false);
    });

    test('starts the session from the token response and does not fetch the session information again', async () => {
        mockFetch(() => Promise.resolve(jsonResponse({ username: 'test', expires_in: 60 * 60 })));
        const probe = await renderReadyProbe();

        const callbacks = signinCallbacks();
        probe.signin!('user', 'password', callbacks);

        await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledTimes(1));
        const authMeCalls = (global.fetch as Mock).mock.calls.filter(([url]) => String(url) === `${API_BACKEND_URL}/auth/me`);
        expect(authMeCalls).toHaveLength(1);
        expect((global.fetch as Mock).mock.calls.filter(([url]) => String(url) === `${API_BACKEND_URL}/auth/token`)).toHaveLength(1);
        await waitFor(() => expect(probe.isAuthenticated).toBe(true));
        expect(probe.expiresIn).toBe(60 * 60);
    });

    test('reports an error instead of invalid credentials when the token response carries no session information', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockFetch(() => Promise.resolve({ status: 200, ok: true, json: () => Promise.reject(new Error('no body')) } as unknown as Response));
        const probe = await renderReadyProbe();

        const callbacks = signinCallbacks();
        probe.signin!('user', 'password', callbacks);

        await waitFor(() => expect(callbacks.onError).toHaveBeenCalledTimes(1));
        expect(callbacks.onInvalidCredentials).not.toHaveBeenCalled();
        expect(callbacks.onSuccess).not.toHaveBeenCalled();
        expect(callbacks.onRateLimited).not.toHaveBeenCalled();
        expect(probe.isAuthenticated).toBe(false);
        expect(probe.expiresIn).toBeNull();
    });

    test('reports an error instead of invalid credentials when the token response does not match the schema', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockFetch(() => Promise.resolve(jsonResponse({ username: 'test', expires_in: 'soon' })));
        const probe = await renderReadyProbe();

        const callbacks = signinCallbacks();
        probe.signin!('user', 'password', callbacks);

        await waitFor(() => expect(callbacks.onError).toHaveBeenCalledTimes(1));
        expect(callbacks.onInvalidCredentials).not.toHaveBeenCalled();
        expect(probe.isAuthenticated).toBe(false);
        expect(probe.expiresIn).toBeNull();
    });

    test('reports an error instead of invalid credentials when the backend fails', async () => {
        mockFetch(() => Promise.resolve(jsonResponse({}, 500)));
        const probe = await renderReadyProbe();

        const callbacks = signinCallbacks();
        probe.signin!('user', 'password', callbacks);

        await waitFor(() => expect(callbacks.onError).toHaveBeenCalledTimes(1));
        expect(callbacks.onInvalidCredentials).not.toHaveBeenCalled();
        expect(callbacks.onRateLimited).not.toHaveBeenCalled();
    });

    test('reports an error instead of invalid credentials when the backend is unreachable', async () => {
        mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
        const probe = await renderReadyProbe();

        const callbacks = signinCallbacks();
        probe.signin!('user', 'password', callbacks);

        await waitFor(() => expect(callbacks.onError).toHaveBeenCalledTimes(1));
        expect(callbacks.onInvalidCredentials).not.toHaveBeenCalled();
    });

    test('accepts a token response whose session is already in its last second', async () => {
        mockFetch(() => Promise.resolve(jsonResponse({ username: 'test', expires_in: 0 })));
        const probe = await renderReadyProbe();

        const callbacks = signinCallbacks();
        probe.signin!('user', 'password', callbacks);

        await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledTimes(1));
        expect(callbacks.onInvalidCredentials).not.toHaveBeenCalled();
        expect(callbacks.onError).not.toHaveBeenCalled();
    });
});
