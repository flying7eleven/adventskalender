import { act, render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { LoginView } from './index';
import { ThemeProvider } from '../../provider/ThemeProvider';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';
import { mockPrefersDarkColorScheme } from '../../test/mockMatchMedia';

const STORAGE_KEY = 'test-ui-theme';

const renderLoginView = () => {
    const { container } = render(
        <MemoryRouter>
            <ThemeProvider defaultTheme="system" storageKey={STORAGE_KEY}>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <AuthenticationProvider>
                        <LoginView />
                    </AuthenticationProvider>
                </LocalizationProvider>
            </ThemeProvider>
        </MemoryRouter>
    );
    return () => container.querySelector<HTMLElement>('[style*="background-image"]')!;
};

describe('LoginView', () => {
    beforeEach(() => {
        localStorage.clear();
        global.fetch = vi.fn().mockImplementation(() => Promise.resolve({ status: 401, ok: false } as Response));
    });

    test('shows the light image for the light theme', async () => {
        localStorage.setItem(STORAGE_KEY, 'light');
        mockPrefersDarkColorScheme(true);
        const getBackground = renderLoginView();
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));

        expect(getBackground().style.backgroundImage).toBe('url("images/loginLight.jpg")');
    });

    test('shows the dark image for the dark theme', async () => {
        localStorage.setItem(STORAGE_KEY, 'dark');
        mockPrefersDarkColorScheme(false);
        const getBackground = renderLoginView();
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));

        expect(getBackground().style.backgroundImage).toBe('url("images/loginDark.jpg")');
    });

    test('switches the image when the OS color scheme changes while the theme is system', async () => {
        const colorScheme = mockPrefersDarkColorScheme(false);
        const getBackground = renderLoginView();
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));

        expect(getBackground().style.backgroundImage).toBe('url("images/loginLight.jpg")');

        act(() => colorScheme.setPrefersDark(true));

        expect(getBackground().style.backgroundImage).toBe('url("images/loginDark.jpg")');
    });
});
