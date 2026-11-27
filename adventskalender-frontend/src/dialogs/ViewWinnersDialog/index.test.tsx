import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ViewWinnersDialog } from './index';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import German from '../../languages/de.json';
import { WinnerInformation } from '../../api';

const renderDialog = ({ winningDate = '2026-12-05', listOfWinner = [] as WinnerInformation[], isOpen = true, onClose = vi.fn() } = {}) =>
    render(
        <LocalizationProvider resources={{ english: English, german: German }}>
            <ViewWinnersDialog winningDate={winningDate} listOfWinner={listOfWinner} isOpen={isOpen} onClose={onClose} />
        </LocalizationProvider>
    );

describe('ViewWinnersDialog', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test.each([
        { day: '05', title: English.dashboard.dialogs.new_winners.title2.replace('{0}', '5') },
        { day: '06', title: English.dashboard.dialogs.new_winners.title2_special1.replace('{0}', '6') },
        { day: '24', title: English.dashboard.dialogs.new_winners.title2_special2.replace('{0}', '24') },
    ])('titles the dialog with the door of December $day', ({ day, title }) => {
        renderDialog({ winningDate: `2026-12-${day}` });

        expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });

    test('lists the winners of the day sorted by package, each with day and package', () => {
        renderDialog({
            winningDate: '2026-12-05',
            listOfWinner: [
                { id: 1, firstName: 'John', lastName: 'Doe', presentIdentifier: 'C' },
                { id: 2, firstName: 'Erika', lastName: 'Musterfrau', presentIdentifier: 'A' },
                { id: 3, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: 'B' },
            ],
        });

        expect(screen.getByRole('dialog')).toHaveTextContent('The winners for Saturday, December 05, 2026: Erika Musterfrau (5A), Max Mustermann (5B), John Doe (5C)');
    });

    test('shows only the day for a winner without a package', () => {
        renderDialog({ listOfWinner: [{ id: 1, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: null }] });

        expect(screen.getByRole('dialog')).toHaveTextContent('Max Mustermann (5)');
        expect(screen.getByRole('dialog')).not.toHaveTextContent('null');
    });

    test('writes the date in German for German browsers', () => {
        vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('de-DE');
        renderDialog({ listOfWinner: [{ id: 1, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: 'A' }] });

        expect(screen.getByRole('dialog')).toHaveTextContent('Die Gewinner:innen für Samstag den 05. Dezember 2026: Max Mustermann (5A)');
    });

    test('closes with the finish button', async () => {
        const onClose = vi.fn();
        renderDialog({ onClose });

        await userEvent.setup().click(screen.getByRole('button', { name: English.dashboard.dialogs.new_winners.finish_button }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('closes with the escape key', async () => {
        const onClose = vi.fn();
        renderDialog({ onClose });

        await userEvent.setup().keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('renders nothing while closed', () => {
        renderDialog({ isOpen: false, listOfWinner: [{ id: 1, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: 'A' }] });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText(/Mustermann/)).not.toBeInTheDocument();
    });
});
