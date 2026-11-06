import { render, waitFor } from '@testing-library/react';
import { AuthenticationProvider } from './index';
import { useAuthentication } from '../../hooks/useAuthentication';
import { API_BACKEND_URL } from '../../api';

type SigninFn = (user: string, password: string, successCallback: VoidFunction, failCallback: VoidFunction, rateLimitCallback?: (waitTimeSeconds: number) => void) => void;

const renderProbe = () => {
    let signin: SigninFn | null = null;
    const ProbeComponent = () => {
        const auth = useAuthentication();
        signin = auth.signin;
        return null;
    };
    render(
        <AuthenticationProvider>
            <ProbeComponent />
        </AuthenticationProvider>
    );
    return () => signin as SigninFn;
};

describe('AuthenticationProvider signin', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('reports the Retry-After seconds to the rate limit callback on 429', async () => {
        global.fetch = jest.fn().mockImplementation((url: RequestInfo | URL) => {
            if (String(url) === `${API_BACKEND_URL}/auth/token`) {
                return Promise.resolve({
                    status: 429,
                    ok: false,
                    headers: new Headers({ 'Retry-After': '42' }),
                } as unknown as Response);
            }
            return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) } as unknown as Response);
        });

        const getSignin = renderProbe();
        await waitFor(() => expect(getSignin()).toBeTruthy());

        const rateLimitCallback = jest.fn();
        const successCallback = jest.fn();
        const failCallback = jest.fn();
        getSignin()('user', 'password', successCallback, failCallback, rateLimitCallback);

        await waitFor(() => expect(rateLimitCallback).toHaveBeenCalledWith(42));
        expect(successCallback).not.toHaveBeenCalled();
        expect(failCallback).not.toHaveBeenCalled();
    });

    test('calls the fail callback when the credentials are wrong', async () => {
        global.fetch = jest.fn().mockImplementation(() => Promise.resolve({ status: 401, ok: false } as unknown as Response));

        const getSignin = renderProbe();
        await waitFor(() => expect(getSignin()).toBeTruthy());

        const rateLimitCallback = jest.fn();
        const successCallback = jest.fn();
        const failCallback = jest.fn();
        getSignin()('user', 'wrong-password', successCallback, failCallback, rateLimitCallback);

        await waitFor(() => expect(failCallback).toHaveBeenCalledTimes(1));
        expect(rateLimitCallback).not.toHaveBeenCalled();
        expect(successCallback).not.toHaveBeenCalled();
    });

    test('starts the session from the token response and does not fetch the session information again', async () => {
        global.fetch = jest.fn().mockImplementation((url: RequestInfo | URL) => {
            if (String(url) === `${API_BACKEND_URL}/auth/token`) {
                return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) } as unknown as Response);
            }
            return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) } as unknown as Response);
        });

        const getSignin = renderProbe();
        await waitFor(() => expect(getSignin()).toBeTruthy());

        const rateLimitCallback = jest.fn();
        const successCallback = jest.fn();
        const failCallback = jest.fn();
        getSignin()('user', 'password', successCallback, failCallback, rateLimitCallback);

        await waitFor(() => expect(successCallback).toHaveBeenCalledTimes(1));
        const authMeCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url) === `${API_BACKEND_URL}/auth/me`);
        expect(authMeCalls).toHaveLength(1);
        expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url) === `${API_BACKEND_URL}/auth/token`)).toHaveLength(1);
        expect(rateLimitCallback).not.toHaveBeenCalled();
    });

    test('calls the fail callback when the token response carries no session information', async () => {
        global.fetch = jest.fn().mockImplementation((url: RequestInfo | URL) => {
            if (String(url) === `${API_BACKEND_URL}/auth/token`) {
                return Promise.resolve({ status: 200, ok: true, json: () => Promise.reject(new Error('no body')) } as unknown as Response);
            }
            return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) } as unknown as Response);
        });

        const getSignin = renderProbe();
        await waitFor(() => expect(getSignin()).toBeTruthy());

        const rateLimitCallback = jest.fn();
        const successCallback = jest.fn();
        const failCallback = jest.fn();
        getSignin()('user', 'password', successCallback, failCallback, rateLimitCallback);

        await waitFor(() => expect(failCallback).toHaveBeenCalledTimes(1));
        expect(successCallback).not.toHaveBeenCalled();
        expect(rateLimitCallback).not.toHaveBeenCalled();
    });

    test('accepts a token response whose session is already in its last second', async () => {
        global.fetch = jest.fn().mockImplementation((url: RequestInfo | URL) => {
            if (String(url) === `${API_BACKEND_URL}/auth/token`) {
                return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 0 }) } as unknown as Response);
            }
            return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) } as unknown as Response);
        });

        const getSignin = renderProbe();
        await waitFor(() => expect(getSignin()).toBeTruthy());

        const rateLimitCallback = jest.fn();
        const successCallback = jest.fn();
        const failCallback = jest.fn();
        getSignin()('user', 'password', successCallback, failCallback, rateLimitCallback);

        await waitFor(() => expect(successCallback).toHaveBeenCalledTimes(1));
        expect(failCallback).not.toHaveBeenCalled();
        expect(rateLimitCallback).not.toHaveBeenCalled();
    });
});
