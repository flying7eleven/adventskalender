import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DashboardView } from './index';
import { RequireAuthentication } from '../../components/RequireAuthentication';
import { MemoryRouter } from 'react-router';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
    Toaster: () => null,
}));

import { toast } from 'sonner';

type MaybePromise<T> = T | Promise<T>;

const mockFetchWith = (handlers: Record<string, () => MaybePromise<{ status: number; ok: boolean; json: () => Promise<unknown> }>>) => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
        for (const [prefix, respond] of Object.entries(handlers)) {
            if (url.startsWith(prefix)) {
                return respond();
            }
        }
        return { status: 404, ok: false, json: () => Promise.resolve({}) };
    });
};

const renderView = () =>
    render(
        <MemoryRouter>
            <AuthenticationProvider>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <RequireAuthentication>
                        <DashboardView />
                    </RequireAuthentication>
                </LocalizationProvider>
            </AuthenticationProvider>
        </MemoryRouter>
    );

const waitForAuth = async () => {
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/count`, expect.anything()));
    await new Promise((resolve) => setTimeout(resolve, 50));
};

const selectDay = async (dayOption: RegExp) => {
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('combobox')[0]);
    await waitFor(() => expect(screen.getByRole('option', { name: dayOption })).toBeInTheDocument());
    await user.click(screen.getByRole('option', { name: dayOption }));
};

describe('DashboardView', () => {
    beforeEach(() => {
        (toast.error as Mock).mockClear();
        Element.prototype.scrollIntoView = vi.fn();
        Element.prototype.hasPointerCapture = vi.fn();
        Element.prototype.releasePointerCapture = vi.fn();
        Element.prototype.setPointerCapture = vi.fn();
    });

    test('shows a message when the day already has the maximum number of winners', async () => {
        mockFetchWith({
            [`${API_BACKEND_URL}/auth/me`]: () => ({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 3600 }) }),
            [`${API_BACKEND_URL}/participants/count`]: () => ({
                status: 200,
                ok: true,
                json: () => Promise.resolve({ number_of_participants: 10, number_of_participants_won: 3, number_of_participants_still_in_raffle: 7 }),
            }),
            [`${API_BACKEND_URL}/participants/won/`]: () => ({ status: 200, ok: true, json: () => Promise.resolve(0) }),
            [`${API_BACKEND_URL}/participants/pick/`]: () => ({ status: 409, ok: false, json: () => Promise.resolve({}) }),
        });
        renderView();
        await waitForAuth();

        fireEvent.click(screen.getByRole('button', { name: /Pick new winners/ }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('maximum number of winners'), expect.anything()));
        expect(screen.queryByRole('button', { name: 'Okay' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Pick new winners/ })).not.toBeDisabled();
    });

    test('ignores stale winner counter responses and applies the latest one', async () => {
        let resolveFirst!: (value: { status: number; ok: boolean; json: () => Promise<unknown> }) => void;
        const firstCount = new Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>((resolve) => {
            resolveFirst = resolve;
        });
        let counterCall = 0;
        mockFetchWith({
            [`${API_BACKEND_URL}/auth/me`]: () => ({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 3600 }) }),
            [`${API_BACKEND_URL}/participants/count`]: () => ({
                status: 200,
                ok: true,
                json: () => Promise.resolve({ number_of_participants: 10, number_of_participants_won: 3, number_of_participants_still_in_raffle: 7 }),
            }),
            [`${API_BACKEND_URL}/participants/won/`]: () => {
                counterCall += 1;
                if (counterCall === 1) {
                    return Promise.resolve(firstCount);
                }
                return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(5) });
            },
        });
        renderView();
        await waitForAuth();

        await selectDay(/December 02/);
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/won/${new Date().getFullYear()}-12-2/count`, expect.anything()));

        await selectDay(/December 03/);
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/won/${new Date().getFullYear()}-12-3/count`, expect.anything()));
        await waitFor(() => expect(screen.getByText(/There are 5 winner/)).toBeInTheDocument());

        resolveFirst({ status: 200, ok: true, json: () => Promise.resolve(0) });
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(screen.getByText(/There are 5 winner/)).toBeInTheDocument();
        expect(screen.queryByText(/There are 0 winner/)).not.toBeInTheDocument();
    });
});
