import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { RequireAuthentication } from './index';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { API_BACKEND_URL } from '../../api';

const LoginProbe = () => {
    const location = useLocation();
    const from = (location.state as { from?: { pathname: string; search: string; hash: string } } | null)?.from;
    return <div data-testid="login">{from ? `${from.pathname}${from.search}${from.hash}` : 'no previous page'}</div>;
};

const renderProtectedPage = (initialEntry = '/calendar?day=3#winners') =>
    render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <AuthenticationProvider>
                <Routes>
                    <Route
                        path="/calendar"
                        element={
                            <RequireAuthentication>
                                <div>protected content</div>
                            </RequireAuthentication>
                        }
                    />
                    <Route path="/login" element={<LoginProbe />} />
                </Routes>
            </AuthenticationProvider>
        </MemoryRouter>
    );

const mockSessionCheck = (response: () => Promise<Response>) => {
    global.fetch = vi.fn().mockImplementation(response);
};

describe('RequireAuthentication', () => {
    test('shows the page to an authenticated user', async () => {
        mockSessionCheck(() => Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ username: 'test', expires_in: 3600 }) } as Response));
        renderProtectedPage();

        expect(await screen.findByText('protected content')).toBeInTheDocument();
        expect(screen.queryByTestId('login')).not.toBeInTheDocument();
    });

    test('sends an unauthenticated user to the login page and remembers the requested page', async () => {
        mockSessionCheck(() => Promise.resolve({ status: 401, ok: false, json: () => Promise.resolve({}) } as Response));
        renderProtectedPage();

        expect(await screen.findByTestId('login')).toHaveTextContent('/calendar?day=3#winners');
        expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    });

    test('sends the user to the login page when the session cannot be checked', async () => {
        mockSessionCheck(() => Promise.reject(new TypeError('Failed to fetch')));
        renderProtectedPage();

        expect(await screen.findByTestId('login')).toBeInTheDocument();
        expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    });

    test('neither shows the page nor redirects while the session is being checked', async () => {
        mockSessionCheck(() => new Promise<Response>(() => undefined));
        renderProtectedPage();

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        expect(screen.queryByText('protected content')).not.toBeInTheDocument();
        expect(screen.queryByTestId('login')).not.toBeInTheDocument();
    });
});
