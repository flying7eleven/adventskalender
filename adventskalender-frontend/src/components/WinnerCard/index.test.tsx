import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { WinnerCard } from './index';
import { MemoryRouter } from 'react-router';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import German from '../../languages/de.json';
import { WinnerInformation } from '../../api';

const winners = [
    { id: 1, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: 'A' },
    { id: 2, firstName: 'Erika', lastName: 'Musterfrau', presentIdentifier: null },
];

const cardTree = (listOfWinner: WinnerInformation[]) => (
    <MemoryRouter>
        <AuthenticationProvider>
            <LocalizationProvider resources={{ english: English, german: German }}>
                <WinnerCard winningDate="2024-12-06" listOfWinner={listOfWinner} numberOfMaxSubPackages={5} updateWinnerList={vi.fn()} />
            </LocalizationProvider>
        </AuthenticationProvider>
    </MemoryRouter>
);

const renderCard = () => render(cardTree(winners));

describe('WinnerCard', () => {
    beforeEach(() => {
        global.fetch = vi.fn().mockImplementation((url: string) =>
            Promise.resolve({
                status: url.endsWith('/auth/me') ? 200 : 204,
                ok: true,
                json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }),
            } as Response)
        );
        Element.prototype.scrollIntoView = () => {};
        Element.prototype.hasPointerCapture = vi.fn();
        Element.prototype.releasePointerCapture = vi.fn();
        Element.prototype.setPointerCapture = vi.fn();
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
    });

    afterEach(() => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
        vi.restoreAllMocks();
    });

    test('opens the edit dialog with the stored package preselected', async () => {
        renderCard();

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: English.calendar.cards.winners.button_edit }));

        const dialog = await screen.findByRole('dialog');
        const firstRowCombobox = within(dialog)
            .getAllByText('Max Mustermann')
            .map((element) => element.closest('tr'))
            .find((row) => row !== null)!
            .querySelector('button[role="combobox"]')!;
        expect(firstRowCombobox).toHaveTextContent('A');
    });

    test('preselects the updated packages after the winner list changes', async () => {
        const { rerender } = render(cardTree(winners));
        rerender(
            cardTree([
                { id: 1, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: 'B' },
                { id: 2, firstName: 'Erika', lastName: 'Musterfrau', presentIdentifier: 'C' },
            ])
        );

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: English.calendar.cards.winners.button_edit }));

        const dialog = await screen.findByRole('dialog');
        const comboboxOf = (userName: string) =>
            within(dialog)
                .getAllByText(userName)
                .map((element) => element.closest('tr'))
                .find((row) => row !== null)!
                .querySelector('button[role="combobox"]')!;
        expect(comboboxOf('Max Mustermann')).toHaveTextContent('B');
        expect(comboboxOf('Erika Musterfrau')).toHaveTextContent('C');
    });

    test('opens the view dialog with the named view button', async () => {
        renderCard();

        await userEvent.setup().click(screen.getByRole('button', { name: English.calendar.cards.winners.button_view }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    test('names the icon-only buttons in German for German browsers', () => {
        vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('de-DE');
        renderCard();

        expect(screen.getByRole('button', { name: German.calendar.cards.winners.button_view })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: German.calendar.cards.winners.button_edit })).toBeInTheDocument();
    });
});
