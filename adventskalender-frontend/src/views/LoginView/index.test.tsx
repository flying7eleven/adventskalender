import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, type Mock } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, type InitialEntry } from 'react-router';

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
    Toaster: () => null,
}));

import { toast } from 'sonner';
import { LoginView } from './index';
import { ThemeProvider } from '../../provider/ThemeProvider';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';
import { mockPrefersDarkColorScheme } from '../../test/mockMatchMedia';

const STORAGE_KEY = 'test-ui-theme';

const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>;
};

const renderLoginView = (initialEntries: InitialEntry[] = ['/login']) => {
    const { container } = render(
        <MemoryRouter initialEntries={initialEntries}>
            <ThemeProvider defaultTheme="system" storageKey={STORAGE_KEY}>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <AuthenticationProvider>
                        <Routes>
                            <Route path="/login" element={<LoginView />} />
                            <Route path="*" element={<LocationProbe />} />
                        </Routes>
                    </AuthenticationProvider>
                </LocalizationProvider>
            </ThemeProvider>
        </MemoryRouter>
    );
    return () => container.querySelector<HTMLElement>('[style*="background-image"]')!;
};

const jsonResponse = (body: unknown, status = 200) => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) }) as unknown as Response;

const mockFetch = (tokenResponse: () => Promise<Response>, meResponse: () => Promise<Response> = () => Promise.resolve(jsonResponse({}, 401))) => {
    global.fetch = vi.fn().mockImplementation((url: RequestInfo | URL) => {
        if (String(url) === `${API_BACKEND_URL}/auth/token`) {
            return tokenResponse();
        }
        return meResponse();
    });
};

const tokenCalls = () => (global.fetch as Mock).mock.calls.filter(([url]) => String(url) === `${API_BACKEND_URL}/auth/token`);

const fromState = (from: { pathname: string; search: string; hash: string }) => ({ pathname: '/login', state: { from } });

const submitCredentials = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
    await user.type(screen.getByLabelText(/Username/), 'user');
    await user.type(screen.getByLabelText(/Password/), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('LoginView', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
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

describe('LoginView sign in', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        mockPrefersDarkColorScheme(false);
    });

    test('redirects an already authenticated user to the page they came from', async () => {
        mockFetch(
            () => Promise.resolve(jsonResponse({}, 401)),
            () => Promise.resolve(jsonResponse({ username: 'test', expires_in: 60 * 60 }))
        );
        renderLoginView([fromState({ pathname: '/calendar', search: '?day=3', hash: '#winners' })]);

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/calendar?day=3#winners'));
        expect(tokenCalls()).toHaveLength(0);
    });

    test('redirects an already authenticated user without a previous page to the dashboard', async () => {
        mockFetch(
            () => Promise.resolve(jsonResponse({}, 401)),
            () => Promise.resolve(jsonResponse({ username: 'test', expires_in: 60 * 60 }))
        );
        renderLoginView();

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    });

    test('keeps path, query and hash of the original page after signing in', async () => {
        mockFetch(() => Promise.resolve(jsonResponse({ username: 'test', expires_in: 60 * 60 })));
        renderLoginView([fromState({ pathname: '/calendar', search: '?day=3', hash: '#winners' })]);

        await submitCredentials(userEvent.setup());

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/calendar?day=3#winners'));
    });

    test('goes to the dashboard after signing in when the login page was opened directly', async () => {
        mockFetch(() => Promise.resolve(jsonResponse({ username: 'test', expires_in: 60 * 60 })));
        renderLoginView(['/login']);

        await submitCredentials(userEvent.setup());

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    });

    test('disables the submit button while the login request runs and sends only one request', async () => {
        let resolveToken: (response: Response) => void = () => undefined;
        mockFetch(
            () =>
                new Promise<Response>((resolve) => {
                    resolveToken = resolve;
                })
        );
        renderLoginView();
        const user = userEvent.setup();

        await submitCredentials(user);

        const submitButton = screen.getByRole('button', { name: 'Sign in' });
        await waitFor(() => expect(submitButton).toBeDisabled());
        await user.click(submitButton);
        await user.type(screen.getByLabelText(/Password/), '{Enter}');
        expect(tokenCalls()).toHaveLength(1);

        await act(async () => resolveToken(jsonResponse({}, 401)));

        await waitFor(() => expect(submitButton).toBeEnabled());
        expect(toast.error).toHaveBeenCalledWith(English.login.alerts.failed_login.message, expect.anything());
    });

    test('enables the submit button again after a rate limited attempt', async () => {
        mockFetch(() => Promise.resolve({ status: 429, ok: false, headers: new Headers({ 'Retry-After': '7' }) } as unknown as Response));
        renderLoginView();

        await submitCredentials(userEvent.setup());

        await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(English.login.alerts.rate_limited.message.replace('{0}', '7'), expect.anything()));
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    });

    test('shows a generic error instead of the wrong credentials message when the session could not be started', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockFetch(() => Promise.resolve(jsonResponse({ username: 'test' })));
        renderLoginView();

        await submitCredentials(userEvent.setup());

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(English.login.alerts.unexpected_error.message, expect.anything()));
        expect(toast.error).not.toHaveBeenCalledWith(English.login.alerts.failed_login.message, expect.anything());
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
        expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    });
});
