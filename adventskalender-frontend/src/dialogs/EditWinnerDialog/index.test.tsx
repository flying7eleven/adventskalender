import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dispatch, SetStateAction } from 'react';
import { EditWinnerDialog } from './index';
import { MemoryRouter } from 'react-router-dom';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';

const winners = [
    { id: 1, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: 'A' },
    { id: 2, firstName: 'Erika', lastName: 'Musterfrau', presentIdentifier: null },
];

const mockFetch = (putStatus: number) => {
    global.fetch = jest.fn().mockImplementation((url: string) =>
        Promise.resolve({
            status: url.endsWith('/auth/me') ? 200 : putStatus,
            ok: url.endsWith('/auth/me') ? true : putStatus < 400,
            json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }),
        } as Response)
    );
};

const renderDialog = (updateWinnerList: () => void, setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>) =>
    render(
        <MemoryRouter>
            <AuthenticationProvider>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <EditWinnerDialog
                        isOpen={true}
                        listOfWinner={winners}
                        setDialogOpenStateFunction={setDialogOpenStateFunction}
                        numberOfMaxSubPackages={5}
                        packageSelections={{ '1': 'A', '2': '' }}
                        updateWinnerList={updateWinnerList}
                    />
                </LocalizationProvider>
            </AuthenticationProvider>
        </MemoryRouter>
    );

const selectPackageForUser = async (userName: string, optionName: string) => {
    const user = userEvent.setup();
    const row = screen.getByText(userName).closest('tr')!;
    await user.click(row.querySelector('button[role="combobox"]')!);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    await user.click(screen.getByRole('option', { name: optionName }));
};

describe('EditWinnerDialog', () => {
    beforeEach(() => {
        Element.prototype.scrollIntoView = () => {};
        Element.prototype.hasPointerCapture = jest.fn();
        Element.prototype.releasePointerCapture = jest.fn();
        Element.prototype.setPointerCapture = jest.fn();
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
    });

    afterEach(() => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    });

    test('shows the stored package of every winner as the selected value', async () => {
        mockFetch(204);
        renderDialog(jest.fn(), jest.fn());

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        const firstRowCombobox = screen.getByText('Max Mustermann').closest('tr')!.querySelector('button[role="combobox"]')!;
        expect(firstRowCombobox).toHaveTextContent('A');
    });

    test('sends an empty package to the API when clearing the selection', async () => {
        mockFetch(204);
        const updateWinnerList = jest.fn();
        renderDialog(updateWinnerList, jest.fn());

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await selectPackageForUser('Max Mustermann', '-');

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/1`, expect.objectContaining({ method: 'PUT' })));
        const [, init] = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === `${API_BACKEND_URL}/participants/1`)!;
        expect(JSON.parse(init.body)).toEqual({ package: '' });
    });

    test('sends the selected package to the API and refreshes the winner list', async () => {
        mockFetch(204);
        const updateWinnerList = jest.fn();
        renderDialog(updateWinnerList, jest.fn());

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        await selectPackageForUser('Erika Musterfrau', 'C');

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/2`, expect.objectContaining({ method: 'PUT' })));
        const [, init] = (global.fetch as jest.Mock).mock.calls.find(([url]) => url === `${API_BACKEND_URL}/participants/2`)!;
        expect(JSON.parse(init.body)).toEqual({ package: 'C' });
        await waitFor(() => expect(updateWinnerList).toHaveBeenCalledTimes(1));
    });
});
