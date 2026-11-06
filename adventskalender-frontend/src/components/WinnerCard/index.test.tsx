import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WinnerCard } from './index';
import { MemoryRouter } from 'react-router-dom';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';

const winners = [
    { id: 1, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: 'A' },
    { id: 2, firstName: 'Erika', lastName: 'Musterfrau', presentIdentifier: null },
];

const renderCard = () =>
    render(
        <MemoryRouter>
            <AuthenticationProvider>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <WinnerCard winningDate="2024-12-06" listOfWinner={winners} numberOfMaxSubPackages={5} updateWinnerList={jest.fn()} />
                </LocalizationProvider>
            </AuthenticationProvider>
        </MemoryRouter>
    );

describe('WinnerCard', () => {
    beforeEach(() => {
        global.fetch = jest.fn().mockImplementation((url: string) =>
            Promise.resolve({
                status: url.endsWith('/auth/me') ? 200 : 204,
                ok: true,
                json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }),
            } as Response)
        );
        Element.prototype.scrollIntoView = () => {};
        Element.prototype.hasPointerCapture = jest.fn();
        Element.prototype.releasePointerCapture = jest.fn();
        Element.prototype.setPointerCapture = jest.fn();
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
    });

    afterEach(() => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    });

    test('opens the edit dialog with the stored package preselected', async () => {
        renderCard();

        const user = userEvent.setup();
        await user.click(screen.getAllByRole('button')[1]);

        const dialog = await screen.findByRole('dialog');
        const firstRowCombobox = within(dialog)
            .getAllByText('Max Mustermann')
            .map((element) => element.closest('tr'))
            .find((row) => row !== null)!
            .querySelector('button[role="combobox"]')!;
        expect(firstRowCombobox).toHaveTextContent('A');
    });
});
