import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthenticatedView } from './index';
import { MemoryRouter } from 'react-router-dom';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';

jest.useFakeTimers();

const now = Date.now();

const mockFetchWith = (impl: (url: string) => { status: number; ok: boolean; json: () => Promise<unknown>; headers?: Record<string, string> }) => {
    global.fetch = jest.fn().mockImplementation((url: string) => Promise.resolve(impl(url) as unknown as Response));
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

describe('AuthenticatedView session handling', () => {
    afterEach(() => {
        jest.setSystemTime(now);
    });

    test('shows the expiry warning 5 minutes before the reported expiry and logs out at it', async () => {
        mockFetchWith((url) => {
            if (url === `${API_BACKEND_URL}/auth/me`) {
                return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_at: Math.floor(now / 1000) + 60 * 60 }) };
            }
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        });
        renderView();

        await waitFor(() => expect(screen.getByText('page content')).toBeInTheDocument());

        await jest.advanceTimersByTimeAsync((60 - 5) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());

        await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/logout`, expect.anything()));
    });

    test('stay logged in asks the backend to refresh the session and reschedules with the new expiry', async () => {
        mockFetchWith((url) => {
            if (url === `${API_BACKEND_URL}/auth/me`) {
                return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_at: Math.floor(now / 1000) + 60 * 60 }) };
            }
            if (url === `${API_BACKEND_URL}/auth/refresh`) {
                return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_at: Math.floor(now / 1000) + 2 * 60 * 60 }) };
            }
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        });
        renderView();

        await waitFor(() => expect(screen.getByText('page content')).toBeInTheDocument());

        await jest.advanceTimersByTimeAsync((60 - 5) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());

        global.alert = jest.fn();
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
        await user.click(screen.getByRole('button', { name: 'Stay Logged In' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/refresh`, expect.objectContaining({ method: 'POST', credentials: 'include' })));
        await waitFor(() => expect(screen.queryByText('Session Expiring Soon')).not.toBeInTheDocument());

        // the warning must reappear 5 minutes before the NEW expiry (2h from start)
        await jest.advanceTimersByTimeAsync((2 * 60 - 5 - 55) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());
    });
    test('stay logged in logs the user out when the refresh fails', async () => {
        mockFetchWith((url) => {
            if (url === `${API_BACKEND_URL}/auth/me`) {
                return { status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_at: Math.floor(now / 1000) + 60 * 60 }) };
            }
            if (url === `${API_BACKEND_URL}/auth/refresh`) {
                return { status: 401, ok: false, json: () => Promise.reject(new Error('no body')) };
            }
            return { status: 204, ok: true, json: () => Promise.reject(new Error('no body')) };
        });
        const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
        renderView();

        await waitFor(() => expect(screen.getByText('page content')).toBeInTheDocument());

        await jest.advanceTimersByTimeAsync((60 - 5) * 60 * 1000);
        await waitFor(() => expect(screen.getByText('Session Expiring Soon')).toBeInTheDocument());

        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
        await user.click(screen.getByRole('button', { name: 'Stay Logged In' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/refresh`, expect.anything()));
        alertMock.mockRestore();
    });
});
