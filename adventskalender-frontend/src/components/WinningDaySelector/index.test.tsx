import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { WinningDaySelector } from './index';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import German from '../../languages/de.json';

const LABEL = 'Raffle day';

const renderSelector = (props: { selectedDay?: number; changeHandler?: (selected: number) => void } = {}) =>
    render(
        <LocalizationProvider resources={{ english: English, german: German }}>
            <WinningDaySelector label={LABEL} {...props} />
        </LocalizationProvider>
    );

const openSelector = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: LABEL }));
    return user;
};

describe('WinningDaySelector', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 27, 12, 0, 0));
        Element.prototype.scrollIntoView = vi.fn();
        Element.prototype.hasPointerCapture = vi.fn();
        Element.prototype.releasePointerCapture = vi.fn();
        Element.prototype.setPointerCapture = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('offers every raffle day from December 1 to December 24 of the raffle year', async () => {
        renderSelector();

        await openSelector();

        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(24);
        expect(options[0]).toHaveTextContent('Tue, December 01, 2026');
        expect(options[23]).toHaveTextContent('Thu, December 24, 2026');
    });

    test('reports the chosen day as a number', async () => {
        const changeHandler = vi.fn();
        renderSelector({ selectedDay: 1, changeHandler });

        const user = await openSelector();
        await user.click(screen.getByRole('option', { name: 'Sun, December 13, 2026' }));

        expect(changeHandler).toHaveBeenCalledWith(13);
    });

    test('shows the selected day', () => {
        renderSelector({ selectedDay: 7 });

        expect(screen.getByRole('combobox', { name: LABEL })).toHaveTextContent('Mon, December 07, 2026');
    });

    test('shows December 1 when no day is selected', () => {
        renderSelector();

        expect(screen.getByRole('combobox', { name: LABEL })).toHaveTextContent('Tue, December 01, 2026');
    });

    test('writes the days in German for German browsers', async () => {
        vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('de-DE');
        renderSelector();

        await openSelector();

        expect(screen.getAllByRole('option')[0]).toHaveTextContent('Di., 01. Dezember 2026');
    });
});
