import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { SettingsView } from './index';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import German from '../../languages/de.json';

jest.mock('sonner', () => ({
    toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn() },
    Toaster: () => null,
}));

jest.mock('zxcvbn', () => ({
    __esModule: true,
    default: jest.fn(() => ({ score: 4, feedback: { warning: '', suggestions: [] } })),
}));

import zxcvbn from 'zxcvbn';
import { API_BACKEND_URL } from '../../api';

const renderView = () =>
    render(
        <LocalizationProvider resources={{ english: English, german: German }}>
            <SettingsView />
        </LocalizationProvider>
    );

const fillPasswords = async (current = 'old-password') => {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Current password'), current);
    await user.type(screen.getByLabelText('New password'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('Repeat password'), 'correct horse battery staple');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Change password' }) as HTMLButtonElement).disabled).toBe(false));
};

const mockFetch = (status: number, body?: object, retryAfterSeconds?: number) => {
    global.fetch = jest.fn().mockResolvedValue({
        status,
        ok: status < 400,
        headers: new Headers(retryAfterSeconds !== undefined ? { 'Retry-After': String(retryAfterSeconds) } : {}),
        json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
    } as Response);
};

describe('SettingsView password change', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        (zxcvbn as jest.Mock).mockClear();
    });

    test('sends the current password and both new passwords on submit', async () => {
        mockFetch(204);
        renderView();
        await fillPasswords();

        fireEvent.submit(screen.getByRole('button', { name: 'Change password' }).closest('form')!);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/password`, expect.objectContaining({ method: 'PUT', credentials: 'include' })));
        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(JSON.parse(init.body)).toEqual({ current_password: 'old-password', first_time: 'correct horse battery staple', second_time: 'correct horse battery staple' });
    });

    test('submitting the form does not reload the page', async () => {
        mockFetch(204);
        renderView();
        await fillPasswords();

        const form = screen.getByRole('button', { name: 'Change password' }).closest('form')!;
        const submitEvent = fireEvent.submit(form);

        expect(submitEvent).toBe(false);
    });

    test('shows the localized reason of a 422 response', async () => {
        mockFetch(422, { reason: 'wrong_current_password' });
        renderView();
        await fillPasswords();

        fireEvent.submit(screen.getByRole('button', { name: 'Change password' }).closest('form')!);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The current password is wrong.', expect.anything()));
    });

    test('shows a localized message for every reject reason', async () => {
        const cases = [
            ['passwords_do_not_match', 'The passwords do not match.'],
            ['password_too_short', 'The password must be at least 8 characters long.'],
            ['password_too_weak', 'The password must be at least 8 characters long and strong enough.'],
        ] as const;
        for (const [reason, message] of cases) {
            mockFetch(422, { reason });
            const { unmount } = renderView();
            await fillPasswords();
            fireEvent.submit(screen.getByRole('button', { name: 'Change password' }).closest('form')!);
            await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message, expect.anything()));
            unmount();
        }
    });

    test('shows the generic failure dialog for other errors', async () => {
        mockFetch(500);
        renderView();
        await fillPasswords();

        fireEvent.submit(screen.getByRole('button', { name: 'Change password' }).closest('form')!);

        await waitFor(() => expect(screen.getByText('Password change failed')).toBeInTheDocument());
    });

    test('computes the password strength only once per password', async () => {
        renderView();
        await fillPasswords();

        await waitFor(() => expect(zxcvbn).toHaveBeenCalledTimes(28));
    });

    test('hides the strength meter when the new password is cleared', async () => {
        renderView();
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'correct horse battery staple' } });
        await waitFor(() => expect(screen.getByText('Strength: Strong')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText('New password'), { target: { value: '' } });

        await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
        expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();
    });

    test('ignores a strength estimate that arrives after the password was cleared', async () => {
        renderView();

        fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'correct horse battery staple' } });
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: '' } });

        await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
        expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();
    });

    test('shows a rate limit message with the retry time on a 429 response', async () => {
        mockFetch(429, undefined, 42);
        renderView();
        await fillPasswords();

        fireEvent.submit(screen.getByRole('button', { name: 'Change password' }).closest('form')!);

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('42 seconds'), expect.anything()));
    });
});
