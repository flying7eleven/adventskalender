import { createContext, useContext } from 'react';

export type Theme = 'dark' | 'light' | 'system';

export type ResolvedTheme = Exclude<Theme, 'system'>;

interface ThemeContextType {
    theme: Theme;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
    theme: 'system',
    resolvedTheme: 'light',
    setTheme: () => null,
});

export const useTheme = () => {
    return useContext(ThemeContext);
};
