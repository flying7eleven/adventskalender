import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ThemeToggle } from './index';
import { ThemeProvider } from '../../provider/ThemeProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import German from '../../languages/de.json';
import { mockPrefersDarkColorScheme } from '../../test/mockMatchMedia';

const STORAGE_KEY = 'test-ui-theme';
const labels = English.global.theme_toggle;

const renderToggle = (defaultTheme: 'light' | 'system' = 'system') =>
    render(
        <ThemeProvider defaultTheme={defaultTheme} storageKey={STORAGE_KEY}>
            <LocalizationProvider resources={{ english: English, german: German }}>
                <ThemeToggle />
            </LocalizationProvider>
        </ThemeProvider>
    );

describe('ThemeToggle', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('cycles from light over dark and system back to light and keeps the choice', async () => {
        localStorage.setItem(STORAGE_KEY, 'light');
        mockPrefersDarkColorScheme(false);
        renderToggle();
        const user = userEvent.setup();
        const root = document.documentElement;
        expect(root).toHaveClass('light');

        await user.click(screen.getByRole('button', { name: labels.switch_to_dark }));
        expect(root).toHaveClass('dark');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

        await user.click(screen.getByRole('button', { name: labels.switch_to_system }));
        expect(root).toHaveClass('light');
        expect(root).not.toHaveClass('dark');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('system');

        await user.click(screen.getByRole('button', { name: labels.switch_to_light }));
        expect(root).toHaveClass('light');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
        expect(screen.getByRole('button', { name: labels.switch_to_dark })).toBeInTheDocument();
    });

    test('follows a dark operating system after switching to system', async () => {
        localStorage.setItem(STORAGE_KEY, 'dark');
        mockPrefersDarkColorScheme(true);
        renderToggle('light');

        await userEvent.setup().click(screen.getByRole('button', { name: labels.switch_to_system }));

        expect(localStorage.getItem(STORAGE_KEY)).toBe('system');
        expect(document.documentElement).toHaveClass('dark');
    });

    test('names the next theme in German for German browsers', () => {
        vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('de-DE');
        localStorage.setItem(STORAGE_KEY, 'light');
        mockPrefersDarkColorScheme(false);
        renderToggle();

        expect(screen.getByRole('button', { name: German.global.theme_toggle.switch_to_dark })).toBeInTheDocument();
    });
});
