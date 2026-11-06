import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dispatch, SetStateAction } from 'react';
import { DeleteWinnerDialog } from './index';
import { MemoryRouter } from 'react-router-dom';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';

jest.mock('sonner', () => ({
    toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn() },
    Toaster: () => null,
}));

import { toast } from 'sonner';

const mockFetch = (deleteStatus: number) => {
    global.fetch = jest.fn().mockImplementation((url: string) =>
        Promise.resolve({
            status: url.endsWith('/auth/me') ? 200 : deleteStatus,
            ok: url.endsWith('/auth/me') ? true : deleteStatus < 400,
            json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }),
        } as Response)
    );
};

const renderDialog = (updateWinnerList: () => void, setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>) =>
    render(
        <MemoryRouter>
            <AuthenticationProvider>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <DeleteWinnerDialog
                        isOpen={true}
                        userToDelete={{ id: 1, firstName: 'Max', lastName: 'Mustermann' }}
                        setDialogOpenStateFunction={setDialogOpenStateFunction}
                        updateWinnerList={updateWinnerList}
                    />
                </LocalizationProvider>
            </AuthenticationProvider>
        </MemoryRouter>
    );

describe('DeleteWinnerDialog', () => {
    beforeEach(() => {
        (toast.error as jest.Mock).mockClear();
    });

    test('calls updateWinnerList and closes the dialog on success', async () => {
        mockFetch(204);
        const updateWinnerList = jest.fn();
        const setDialogOpenStateFunction = jest.fn() as unknown as Dispatch<SetStateAction<boolean>>;
        renderDialog(updateWinnerList, setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireEvent.click(screen.getByRole('button', { name: 'Yes, remove the participant' }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/won/1`, expect.anything()), { timeout: 3000 });
        await waitFor(() => expect(updateWinnerList).toHaveBeenCalledTimes(1));
        expect(setDialogOpenStateFunction).toHaveBeenCalledWith(false);
    });

    test('shows an error toast and keeps the dialog open when the backend reports an error', async () => {
        mockFetch(500);
        const updateWinnerList = jest.fn();
        const setDialogOpenStateFunction = jest.fn();
        renderDialog(updateWinnerList, setDialogOpenStateFunction);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireEvent.click(screen.getByRole('button', { name: 'Yes, remove the participant' }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The winner could not be removed. Please try again.', expect.anything()));
        expect(updateWinnerList).not.toHaveBeenCalled();
        expect(setDialogOpenStateFunction).not.toHaveBeenCalledWith(false);
        expect(screen.getByRole('button', { name: 'Yes, remove the participant' })).toBeInTheDocument();
    });
});
