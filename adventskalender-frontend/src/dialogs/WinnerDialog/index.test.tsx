import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import userEvent from '@testing-library/user-event';
import { WinnerDialog } from './index';
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
});
