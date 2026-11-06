import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WinnerDialog } from './index';
import { MemoryRouter } from 'react-router-dom';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';

const winners = [1, 2, 3, 4, 5].map((id) => ({ id, firstName: `First${id}`, lastName: `Last${id}` }));

const mockFetch = () => {
    global.fetch = jest.fn().mockImplementation((url: string) =>
        Promise.resolve({
            status: url.endsWith('/auth/me') ? 200 : 204,
            ok: true,
            json: () => Promise.resolve({ username: 'test', expires_at: 1234567890 }),
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
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
    });

    afterEach(() => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    });

    test('the close button un-picks the winners on the first step', async () => {
        const setDialogOpenStateFunction = jest.fn();
        renderDialog(setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/won/1`, expect.anything()));
        await waitFor(() => expect(setDialogOpenStateFunction).toHaveBeenCalledWith(false));
    });

    test('the close button keeps the winners on the second step', async () => {
        const setDialogOpenStateFunction = jest.fn();
        renderDialog(setDialogOpenStateFunction);

        await goToSecondStep();
        (global.fetch as jest.Mock).mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(setDialogOpenStateFunction).toHaveBeenCalledWith(false));
        expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => url.includes('/participants/won/'))).toHaveLength(0);
    });

    test('escape does not un-pick the winners on the second step', async () => {
        const setDialogOpenStateFunction = jest.fn();
        renderDialog(setDialogOpenStateFunction);

        await goToSecondStep();
        (global.fetch as jest.Mock).mockClear();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => url.includes('/participants/won/'))).toHaveLength(0);
        expect(setDialogOpenStateFunction).not.toHaveBeenCalledWith(false);
        expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
    });
});
