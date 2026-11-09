import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthenticatedView } from './index';
import { MemoryRouter } from 'react-router-dom';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';

vi.useFakeTimers({ shouldAdvanceTime: true });

const now = Date.now();

const mockFetchWith = (impl: (url: string) => { status: number; ok: boolean; json: () => Promise<unknown>; headers?: Record<string, string> }) => {
    global.fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(impl(url) as unknown as Response));
};

const renderView = () =>
    render(
        <MemoryRouter>
            <AuthenticationProvider>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <AuthenticatedView content={<div>page content</div>} />
                </LocalizationProvider>
            </AuthenticationProvider>
        </MemoryRouter>
    );

const settleAuthentication = async () => {
    await waitFor(() => expect(screen.getByText('page content')).toBeInTheDocument());
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
};

describe('AuthenticatedView session handling', () => {
    afterEach(() => {
        vi.setSystemTime(now);
    });

    test('shows the expiry warning 5 minutes before the reported expiry and logs out at it', async () => {
        let authMeCalls = 0;
        mockFetchWith((url) => {
            if (url === `${API_BACKEND_URL}/auth/me`) {
                authMeCalls += 1;
                if (authMeCalls === 1) {
                    return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) };
                }
                return { status: 401, ok: false, json: () => Promise.reject(new Error('no body')) };
            }
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        });
        const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        renderView();
        await settleAuthentication();

        await vi.advanceTimersByTimeAsync((60 - 5) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
        await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Your session has expired. Please log in again.'));
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/logout`, expect.anything()));
        alertMock.mockRestore();
    });

    test('stay logged in asks the backend to refresh the session and reschedules with the new expiry', async () => {
        mockFetchWith((url) => {
            if (url === `${API_BACKEND_URL}/auth/me`) {
                return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) };
            }
            if (url === `${API_BACKEND_URL}/auth/refresh`) {
                return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 2 * 60 * 60 }) };
            }
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        });
        renderView();
        await settleAuthentication();

        await vi.advanceTimersByTimeAsync((60 - 5) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());

        global.alert = vi.fn();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
        await user.click(screen.getByRole('button', { name: 'Stay Logged In' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/refresh`, expect.objectContaining({ method: 'POST', credentials: 'include' })));
        await waitFor(() => expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument());

        // the warning must reappear 5 minutes before the NEW expiry (2h after the refresh)
        await vi.advanceTimersByTimeAsync((2 * 60 - 5) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());
    });

    test('stay logged in reschedules even when the refresh reports the same remaining lifetime', async () => {
        let authMeCalls = 0;
        mockFetchWith((url) => {
            if (url === `${API_BACKEND_URL}/auth/me`) {
                authMeCalls += 1;
                if (authMeCalls === 1) {
                    return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) };
                }
                return { status: 401, ok: false, json: () => Promise.reject(new Error('no body')) };
            }
            if (url === `${API_BACKEND_URL}/auth/refresh`) {
                return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) };
            }
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        });
        const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        renderView();
        await settleAuthentication();

        await vi.advanceTimersByTimeAsync((60 - 5) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());

        global.alert = vi.fn();
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
        await user.click(screen.getByRole('button', { name: 'Stay Logged In' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/refresh`, expect.objectContaining({ method: 'POST', credentials: 'include' })));
        await waitFor(() => expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument());

        // the deadline from before the refresh must no longer end the session
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(alertMock).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/logout`, expect.anything());

        // the warning reappears 5 minutes before the expiry reported by the refresh
        await vi.advanceTimersByTimeAsync((60 - 5) * 60 * 1000 - 5 * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());
        alertMock.mockRestore();
    });

    test('stay logged in logs the user out when the refresh fails', async () => {
        mockFetchWith((url) => {
            if (url === `${API_BACKEND_URL}/auth/me`) {
                return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) };
            }
            if (url === `${API_BACKEND_URL}/auth/refresh`) {
                return { status: 401, ok: false, json: () => Promise.reject(new Error('no body')) };
            }
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        });
        const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        renderView();
        await settleAuthentication();

        await vi.advanceTimersByTimeAsync((60 - 5) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());

        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
        await user.click(screen.getByRole('button', { name: 'Stay Logged In' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/refresh`, expect.anything()));
        await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Your session has expired. Please log in again.'));
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/logout`, expect.anything()));
        alertMock.mockRestore();
    });

    test('reschedules instead of logging out when another tab has refreshed the session', async () => {
        mockFetchWith((url) => {
            if (url === `${API_BACKEND_URL}/auth/me`) {
                return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) };
            }
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        });
        const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        renderView();
        await settleAuthentication();

        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

        // The expiry fired, but /auth/me still reports a valid session refreshed
        // by another tab, so monitoring reschedules and no logout happens.
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(alertMock).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/logout`, expect.anything());

        // The rescheduled session expires 60 minutes after the re-check.
        await vi.advanceTimersByTimeAsync((60 - 5) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());
        alertMock.mockRestore();
    });

    test('logs the user out when the session expiry re-check fails', async () => {
        let authMeCalls = 0;
        mockFetchWith((url) => {
            if (url === `${API_BACKEND_URL}/auth/me`) {
                authMeCalls += 1;
                if (authMeCalls === 1) {
                    return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) };
                }
                return { status: 401, ok: false, json: () => Promise.reject(new Error('no body')) };
            }
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        });
        const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        renderView();
        await settleAuthentication();

        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

        await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Your session has expired. Please log in again.'));
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/logout`, expect.anything()));
        alertMock.mockRestore();
    });
});
