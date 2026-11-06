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

    test('calls the success callback only after the follow-up /auth/me succeeded', async () => {
        global.fetch = jest.fn().mockImplementation((url: RequestInfo | URL) => {
            if (String(url) === `${API_BACKEND_URL}/auth/token`) {
                return Promise.resolve({ status: 204, ok: true } as unknown as Response);
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
        expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything());
        expect(failCallback).not.toHaveBeenCalled();
        expect(rateLimitCallback).not.toHaveBeenCalled();
    });

    test('calls the fail callback when the follow-up /auth/me fails after a successful login', async () => {
        global.fetch = jest.fn().mockImplementation((url: RequestInfo | URL) => {
            if (String(url) === `${API_BACKEND_URL}/auth/token`) {
                return Promise.resolve({ status: 204, ok: true } as unknown as Response);
            }
            return Promise.resolve({ status: 401, ok: false } as unknown as Response);
        });

        const getSignin = renderProbe();
        await waitFor(() => expect(getSignin()).toBeTruthy());

        const rateLimitCallback = jest.fn();
        const successCallback = jest.fn();
        const failCallback = jest.fn();
        getSignin()('user', 'password', successCallback, failCallback, rateLimitCallback);

        await waitFor(() => expect(failCallback).toHaveBeenCalledTimes(1));
        expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything());
        expect(successCallback).not.toHaveBeenCalled();
        expect(rateLimitCallback).not.toHaveBeenCalled();
    });
});
