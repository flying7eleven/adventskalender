import { useEffect, useState, useSyncExternalStore } from 'react';
import { ResolvedTheme, Theme, ThemeContext } from '../hooks/useTheme';

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const subscribeToColorScheme = (onChange: () => void) => {
    const mediaQueryList = window.matchMedia(DARK_COLOR_SCHEME_QUERY);
    mediaQueryList.addEventListener('change', onChange);
    return () => mediaQueryList.removeEventListener('change', onChange);
};

const systemPrefersDark = () => window.matchMedia(DARK_COLOR_SCHEME_QUERY).matches;

export function ThemeProvider({ children, defaultTheme = 'system', storageKey = 'ui-theme', ...props }: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme) || defaultTheme);
    const prefersDark = useSyncExternalStore(subscribeToColorScheme, systemPrefersDark);
    const resolvedTheme: ResolvedTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(resolvedTheme);
    }, [resolvedTheme]);

    const value = {
        theme,
        resolvedTheme,
        setTheme: (theme: Theme) => {
            localStorage.setItem(storageKey, theme);
            setTheme(theme);
        },
    };

    return (
        <ThemeContext.Provider {...props} value={value}>
            {children}
        </ThemeContext.Provider>
    );
}
