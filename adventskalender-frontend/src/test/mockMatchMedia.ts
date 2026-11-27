import { vi } from 'vitest';

export const mockPrefersDarkColorScheme = (initiallyDark: boolean) => {
    let prefersDark = initiallyDark;
    const listeners = new Set<() => void>();

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        get matches() {
            return query === '(prefers-color-scheme: dark)' && prefersDark;
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));

    return {
        setPrefersDark: (dark: boolean) => {
            prefersDark = dark;
            listeners.forEach((listener) => listener());
        },
        listenerCount: () => listeners.size,
    };
};
