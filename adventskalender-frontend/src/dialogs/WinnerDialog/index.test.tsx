import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import userEvent from '@testing-library/user-event';
import { WinnerDialog } from './index';
import { MemoryRouter } from 'react-router';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import German from '../../languages/de.json';
import { API_BACKEND_URL } from '../../api';

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
    Toaster: () => null,
}));

import { toast } from 'sonner';

const winners = [1, 2, 3, 4, 5].map((id) => ({ id, firstName: `First${id}`, lastName: `Last${id}` }));

const mockFetch = (participantPutStatus?: number) => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
            status: url.endsWith('/auth/me') ? 200 : url.includes('/participants/') && participantPutStatus ? participantPutStatus : 204,
            ok: url.endsWith('/auth/me') ? true : !participantPutStatus || participantPutStatus < 400,
            json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }),
        } as Response)
    );
};

const renderDialog = (setDialogOpenStateFunction: (open: boolean) => void) =>
    render(
        <MemoryRouter>
            <AuthenticationProvider>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <WinnerDialog isOpen={true} winner={winners} numberOfMaxSubPackages={5} date={'2026-12-06'} setDialogOpenStateFunction={setDialogOpenStateFunction} />
                </LocalizationProvider>
            </AuthenticationProvider>
        </MemoryRouter>
    );

const goToSecondStep = async () => {
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Select automatically' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument());
};

describe('WinnerDialog', () => {
    beforeEach(() => {
        mockFetch();
        Element.prototype.scrollIntoView = () => {};
        Element.prototype.hasPointerCapture = vi.fn();
        Element.prototype.releasePointerCapture = vi.fn();
        Element.prototype.setPointerCapture = vi.fn();
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
    });

    afterEach(() => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
        (toast.error as Mock).mockClear();
    });

    test('the close button un-picks the winners on the first step', async () => {
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/won/1`, expect.anything()));
        await waitFor(() => expect(setDialogOpenStateFunction).toHaveBeenCalledWith(false));
    });

    test('the close button keeps the winners on the second step', async () => {
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await goToSecondStep();
        (global.fetch as Mock).mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(setDialogOpenStateFunction).toHaveBeenCalledWith(false));
        expect((global.fetch as Mock).mock.calls.filter(([url]) => url.includes('/participants/won/'))).toHaveLength(0);
    });

    test('escape does not un-pick the winners on the second step', async () => {
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await goToSecondStep();
        (global.fetch as Mock).mockClear();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect((global.fetch as Mock).mock.calls.filter(([url]) => url.includes('/participants/won/'))).toHaveLength(0);
        expect(setDialogOpenStateFunction).not.toHaveBeenCalledWith(false);
        expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
    });

    test('escape does not un-pick the winners on the first step', async () => {
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect((global.fetch as Mock).mock.calls.filter(([url]) => url.includes('/participants/won/'))).toHaveLength(0);
        expect(setDialogOpenStateFunction).not.toHaveBeenCalledWith(false);
        expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    });

    test('stores an empty package when clearing the selection and still allows continuing', async () => {
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        fireEvent.click(screen.getByRole('button', { name: 'Select automatically' }));

        const user = userEvent.setup();
        const firstRowCombobox = screen.getByText('First1 Last1').closest('tr')!.querySelector('button[role="combobox"]')!;
        await user.click(firstRowCombobox);
        await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
        await user.click(screen.getByRole('option', { name: '-' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/1`, expect.objectContaining({ method: 'PUT' })));
        const participantOneCalls = (global.fetch as Mock).mock.calls.filter(([url]) => url === `${API_BACKEND_URL}/participants/1`);
        const [, init] = participantOneCalls[participantOneCalls.length - 1]!;
        expect(JSON.parse(init.body)).toEqual({ package: '' });

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument());
        expect(screen.getByText(/\(6\)/)).toBeInTheDocument();
        expect(screen.queryByText(/6__/)).not.toBeInTheDocument();
    });

    test('shows an error toast when un-picking the winners fails', async () => {
        mockFetch();
        (global.fetch as Mock).mockImplementation((url: string) =>
            Promise.resolve({
                status: url.endsWith('/auth/me') ? 200 : url.includes('/participants/won/') ? 500 : 204,
                ok: url.endsWith('/auth/me'),
                json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }),
            } as Response)
        );
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('could not be removed'), expect.anything()));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(setDialogOpenStateFunction).not.toHaveBeenCalledWith(false);
    });

    test('shows an error toast when the package is already taken on that day (409)', async () => {
        mockFetch(409);
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));

        const user = userEvent.setup();
        const firstRowCombobox = screen.getByText('First1 Last1').closest('tr')!.querySelector('button[role="combobox"]')!;
        await user.click(firstRowCombobox);
        await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
        await user.click(screen.getByRole('option', { name: 'A' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/1`, expect.objectContaining({ method: 'PUT' })));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('already taken'), expect.anything()));
    });

    test('shows an error toast when the package format is invalid (422)', async () => {
        mockFetch(422);
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));

        const user = userEvent.setup();
        const firstRowCombobox = screen.getByText('First1 Last1').closest('tr')!.querySelector('button[role="combobox"]')!;
        await user.click(firstRowCombobox);
        await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
        await user.click(screen.getByRole('option', { name: 'A' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/1`, expect.objectContaining({ method: 'PUT' })));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to select package'), expect.anything()));
    });

    test('the summary step has no cancel button', async () => {
        renderDialog(vi.fn());

        await goToSecondStep();

        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    test.each([
        ['English', English],
        ['German', German],
    ])('shows a translated error in %s when the winners of the day cannot be loaded', async (_, language) => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.endsWith('/auth/me')) {
                return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) } as Response);
            }
            if (url.endsWith('/participants/won/2026-12-06')) {
                return Promise.resolve({ status: 500, ok: false } as Response);
            }
            return Promise.resolve({ status: 204, ok: true } as Response);
        });
        render(
            <MemoryRouter>
                <AuthenticationProvider>
                    <LocalizationProvider resources={{ english: language, german: language }}>
                        <WinnerDialog isOpen={true} winner={winners.slice(0, 4)} numberOfMaxSubPackages={5} date={'2026-12-06'} setDialogOpenStateFunction={vi.fn()} />
                    </LocalizationProvider>
                </AuthenticationProvider>
            </MemoryRouter>
        );

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        fireEvent.click(screen.getByRole('button', { name: language.dashboard.dialogs.new_winners.autofill_button }));
        fireEvent.click(screen.getByRole('button', { name: language.dashboard.dialogs.new_winners.accept_button }));

        expect(await screen.findByText(language.dashboard.dialogs.new_winners.error_loading_winners)).toBeInTheDocument();
    });

    test('the cancel button un-picks all winners on the first step and closes the dialog', async () => {
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(setDialogOpenStateFunction).toHaveBeenCalledWith(false));
        const deletedUrls = (global.fetch as Mock).mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url);
        expect(deletedUrls).toEqual(winners.map((winner) => `${API_BACKEND_URL}/participants/won/${winner.id}`));
    });

    test('a partially failed un-pick only keeps the winners that are still picked', async () => {
        let failSecondWinner = true;
        (global.fetch as Mock).mockImplementation((url: string) => {
            const fails = failSecondWinner && url.endsWith('/participants/won/2');
            return Promise.resolve({
                status: url.endsWith('/auth/me') ? 200 : fails ? 500 : 204,
                ok: !fails,
                json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }),
            } as Response);
        });
        const setDialogOpenStateFunction = vi.fn();
        renderDialog(setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('could not be removed'), expect.anything()));
        await waitFor(() => expect(screen.queryByText('First1 Last1')).not.toBeInTheDocument());
        expect(screen.getByText('First2 Last2')).toBeInTheDocument();
        expect(screen.queryByText('First5 Last5')).not.toBeInTheDocument();
        expect(setDialogOpenStateFunction).not.toHaveBeenCalledWith(false);

        failSecondWinner = false;
        (global.fetch as Mock).mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(setDialogOpenStateFunction).toHaveBeenCalledWith(false));
        const deletedUrls = (global.fetch as Mock).mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url);
        expect(deletedUrls).toEqual([`${API_BACKEND_URL}/participants/won/2`]);
    });

    test('continuing after a partially failed un-pick ignores the errors of the un-picked winners', async () => {
        let failFirstWinner = false;
        (global.fetch as Mock).mockImplementation((url: string, init?: RequestInit) => {
            if (url.endsWith('/participants/won/2026-12-06')) {
                return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve([]) } as Response);
            }
            const fails = failFirstWinner && init?.method === 'DELETE' && url.endsWith('/participants/won/1');
            return Promise.resolve({
                status: url.endsWith('/auth/me') ? 200 : fails ? 500 : 204,
                ok: !fails,
                json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }),
            } as Response);
        });
        const setDialogOpenStateFunction = vi.fn();
        render(
            <MemoryRouter>
                <AuthenticationProvider>
                    <LocalizationProvider resources={{ english: English, german: English }}>
                        <WinnerDialog isOpen={true} winner={winners.slice(0, 3)} numberOfMaxSubPackages={5} date={'2026-12-06'} setDialogOpenStateFunction={setDialogOpenStateFunction} />
                    </LocalizationProvider>
                </AuthenticationProvider>
            </MemoryRouter>
        );
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));

        const user = userEvent.setup();
        for (const [name, option] of [
            ['First1 Last1', 'A'],
            ['First2 Last2', 'B'],
        ]) {
            const combobox = screen.getByText(name).closest('tr')!.querySelector('button[role="combobox"]')!;
            await user.click(combobox);
            await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
            await user.click(screen.getByRole('option', { name: option }));
            await waitFor(() => expect(combobox).toHaveTextContent(option));
        }
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await waitFor(() => expect(screen.getByText('First3 Last3').closest('tr')!.querySelector('button[role="combobox"]')!).toHaveAttribute('aria-invalid', 'true'));

        failFirstWinner = true;
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('could not be removed'), expect.anything()));
        await waitFor(() => expect(screen.queryByText('First3 Last3')).not.toBeInTheDocument());
        expect(screen.queryByText('First2 Last2')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument());
        expect(setDialogOpenStateFunction).not.toHaveBeenCalledWith(false);
    });

    test('keeps both selections when two packages are selected before the first request finishes', async () => {
        const pendingPuts: (() => void)[] = [];
        (global.fetch as Mock).mockImplementation((url: string, init?: RequestInit) => {
            const response = { status: url.endsWith('/auth/me') ? 200 : 204, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }) } as Response;
            if (init?.method === 'PUT') {
                return new Promise<Response>((resolve) => pendingPuts.push(() => resolve(response)));
            }
            return Promise.resolve(response);
        });
        renderDialog(vi.fn());
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));

        const user = userEvent.setup();
        for (const [name, option] of [
            ['First1 Last1', 'A'],
            ['First2 Last2', 'B'],
        ]) {
            await user.click(screen.getByText(name).closest('tr')!.querySelector('button[role="combobox"]')!);
            await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
            await user.click(screen.getByRole('option', { name: option }));
        }
        await waitFor(() => expect(pendingPuts).toHaveLength(2));
        pendingPuts.forEach((resolve) => resolve());

        await waitFor(() => expect(screen.getByText('First2 Last2').closest('tr')!.querySelector('button[role="combobox"]')!).toHaveTextContent('B'));
        expect(screen.getByText('First1 Last1').closest('tr')!.querySelector('button[role="combobox"]')!).toHaveTextContent('A');
    });
});
