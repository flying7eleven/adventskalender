import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './index';
import { ThemeProvider } from '../../provider/ThemeProvider';
import { mockPrefersDarkColorScheme } from '../../test/mockMatchMedia';

const STORAGE_KEY = 'test-ui-theme';

describe('ThemeToggle', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('cycles from light over dark and system back to light and keeps the choice', async () => {
        localStorage.setItem(STORAGE_KEY, 'light');
        mockPrefersDarkColorScheme(false);
        render(
            <ThemeProvider defaultTheme="system" storageKey={STORAGE_KEY}>
                <ThemeToggle />
            </ThemeProvider>
        );
        const user = userEvent.setup();
        const toggle = screen.getByRole('button', { name: 'Toggle theme' });
        const root = document.documentElement;
        expect(root).toHaveClass('light');

        await user.click(toggle);
        expect(root).toHaveClass('dark');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

        await user.click(toggle);
        expect(root).toHaveClass('light');
        expect(root).not.toHaveClass('dark');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('system');

        await user.click(toggle);
        expect(root).toHaveClass('light');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    test('follows a dark operating system after switching to system', async () => {
        localStorage.setItem(STORAGE_KEY, 'dark');
        mockPrefersDarkColorScheme(true);
        render(
            <ThemeProvider defaultTheme="light" storageKey={STORAGE_KEY}>
                <ThemeToggle />
            </ThemeProvider>
        );

        await userEvent.setup().click(screen.getByRole('button', { name: 'Toggle theme' }));

        expect(localStorage.getItem(STORAGE_KEY)).toBe('system');
        expect(document.documentElement).toHaveClass('dark');
    });
});
