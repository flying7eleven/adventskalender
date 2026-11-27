import { vi } from 'vitest';
import { formatRaffleDay, getDefaultRaffleDay, getRaffleDate, getRaffleYear } from './raffleDate';

describe('raffleDate', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    const today = (year: number, monthIndex: number, day: number) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(year, monthIndex, day, 12, 0, 0));
    };

    test.each([
        { label: 'November 27', date: [2026, 10, 27], expectedDay: 1 },
        { label: 'November 5', date: [2026, 10, 5], expectedDay: 1 },
        { label: 'December 1', date: [2026, 11, 1], expectedDay: 1 },
        { label: 'December 5', date: [2026, 11, 5], expectedDay: 5 },
        { label: 'December 24', date: [2026, 11, 24], expectedDay: 24 },
        { label: 'December 26', date: [2026, 11, 26], expectedDay: 24 },
        { label: 'December 31', date: [2026, 11, 31], expectedDay: 24 },
        { label: 'January 3', date: [2027, 0, 3], expectedDay: 1 },
    ])('preselects day $expectedDay on $label', ({ date: [year, monthIndex, day], expectedDay }) => {
        today(year, monthIndex, day);

        expect(getDefaultRaffleDay()).toBe(expectedDay);
    });

    test('uses the current year as raffle year', () => {
        today(2026, 10, 27);
        expect(getRaffleYear()).toBe(2026);

        today(2027, 0, 3);
        expect(getRaffleYear()).toBe(2027);
    });

    test('builds the raffle day as a December date of the current year', () => {
        today(2026, 10, 27);

        const raffleDate = getRaffleDate(6);

        expect(raffleDate.getFullYear()).toBe(2026);
        expect(raffleDate.getMonth()).toBe(11);
        expect(raffleDate.getDate()).toBe(6);
    });

    test.each([
        { day: 1, expected: '2026-12-01' },
        { day: 9, expected: '2026-12-09' },
        { day: 10, expected: '2026-12-10' },
        { day: 24, expected: '2026-12-24' },
    ])('formats day $day as $expected', ({ day, expected }) => {
        today(2026, 10, 27);

        expect(formatRaffleDay(day)).toBe(expected);
    });

    test('formats January visits against the December of the current year', () => {
        today(2027, 0, 3);

        expect(formatRaffleDay(getDefaultRaffleDay())).toBe('2027-12-01');
    });
});
