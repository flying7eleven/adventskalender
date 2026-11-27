import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from '../hooks/useTheme';
import { mockPrefersDarkColorScheme } from '../test/mockMatchMedia';

const STORAGE_KEY = 'test-ui-theme';

const ThemeProbe = () => {
    const { theme, resolvedTheme, setTheme } = useTheme();
    return (
        <>
            <p data-testid="theme">{theme}</p>
            <p data-testid="resolved-theme">{resolvedTheme}</p>
            <button onClick={() => setTheme('dark')}>dark</button>
            <button onClick={() => setTheme('system')}>system</button>
        </>
    );
};

const renderProvider = () =>
    render(
        <ThemeProvider defaultTheme="system" storageKey={STORAGE_KEY}>
            <ThemeProbe />
        </ThemeProvider>
    );

describe('ThemeProvider', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.classList.remove('light', 'dark');
    });

    test('resolves the system theme from the OS color scheme', () => {
        mockPrefersDarkColorScheme(false);
        renderProvider();

        expect(screen.getByTestId('theme')).toHaveTextContent('system');
        expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
        expect(document.documentElement).toHaveClass('light');
    });

    test('follows OS color scheme changes while the theme is system', () => {
        const colorScheme = mockPrefersDarkColorScheme(false);
        renderProvider();

        act(() => colorScheme.setPrefersDark(true));

        expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
        expect(document.documentElement).toHaveClass('dark');
        expect(document.documentElement).not.toHaveClass('light');

        act(() => colorScheme.setPrefersDark(false));

        expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
        expect(document.documentElement).toHaveClass('light');
        expect(document.documentElement).not.toHaveClass('dark');
    });

    test('ignores OS color scheme changes while an explicit theme is stored', () => {
        localStorage.setItem(STORAGE_KEY, 'light');
        const colorScheme = mockPrefersDarkColorScheme(true);
        renderProvider();

        expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');

        act(() => colorScheme.setPrefersDark(false));
        act(() => colorScheme.setPrefersDark(true));

        expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
        expect(document.documentElement).toHaveClass('light');
        expect(document.documentElement).not.toHaveClass('dark');
    });

    test('persists an explicitly selected theme and resolves it', async () => {
        mockPrefersDarkColorScheme(false);
        renderProvider();

        await userEvent.setup().click(screen.getByRole('button', { name: 'dark' }));

        expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
        expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
        expect(document.documentElement).toHaveClass('dark');
    });

    test('returns to the OS color scheme when switching back to system', async () => {
        localStorage.setItem(STORAGE_KEY, 'dark');
        mockPrefersDarkColorScheme(false);
        renderProvider();

        await userEvent.setup().click(screen.getByRole('button', { name: 'system' }));

        expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
        expect(document.documentElement).toHaveClass('light');
    });

    test('stops listening to OS color scheme changes after unmounting', () => {
        const colorScheme = mockPrefersDarkColorScheme(false);
        const { unmount } = renderProvider();

        unmount();

        expect(colorScheme.listenerCount()).toBe(0);
    });
});
