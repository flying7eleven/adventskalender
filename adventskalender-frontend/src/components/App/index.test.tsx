import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
    Toaster: () => null,
}));

import { App } from './index';
import English from '../../languages/en.json';
import { API_BACKEND_URL } from '../../api';
import { mockPrefersDarkColorScheme } from '../../test/mockMatchMedia';

const json = (body: unknown, status = 200) => ({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) }) as Response;

const session = { username: 'test', expires_in: 60 * 60 };

const mockBackend = ({ authenticated }: { authenticated: boolean }) => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
        switch (url) {
            case `${API_BACKEND_URL}/auth/me`:
                return Promise.resolve(authenticated ? json(session) : json({}, 401));
            case `${API_BACKEND_URL}/auth/token`:
                return Promise.resolve(json(session));
            case `${API_BACKEND_URL}/participants/count`:
                return Promise.resolve(json({ number_of_participants: 10, number_of_participants_won: 3, number_of_participants_still_in_raffle: 7 }));
            default:
                return url.includes('/participants/won/') ? Promise.resolve(json(0)) : Promise.resolve(json({}, 404));
        }
    });
};

const openApp = (path: string) => {
    window.history.pushState({}, '', path);
    render(<App />);
};

describe('App routing', () => {
    beforeEach(() => {
        localStorage.clear();
        mockPrefersDarkColorScheme(false);
        Element.prototype.scrollIntoView = vi.fn();
        Element.prototype.hasPointerCapture = vi.fn();
        Element.prototype.releasePointerCapture = vi.fn();
        Element.prototype.setPointerCapture = vi.fn();
    });

    afterEach(() => {
        window.history.pushState({}, '', '/');
    });

    test('sends an unauthenticated user to the login page', async () => {
        mockBackend({ authenticated: false });
        openApp('/');

        expect(await screen.findByRole('button', { name: English.login.form.sign_in_button })).toBeInTheDocument();
        expect(window.location.pathname).toBe('/login');
        expect(screen.queryByRole('button', { name: /Pick new winners/ })).not.toBeInTheDocument();
    });

    test('shows the dashboard to an authenticated user', async () => {
        mockBackend({ authenticated: true });
        openApp('/');

        expect(await screen.findByRole('button', { name: /Pick new winners/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: English.dashboard.navigation.app_title })).toBeInTheDocument();
        expect(window.location.pathname).toBe('/');
    });

    test('brings an unauthenticated user back to the requested page after signing in', async () => {
        mockBackend({ authenticated: false });
        openApp('/settings');
        const user = userEvent.setup();

        await user.type(await screen.findByLabelText(/Username/), 'user');
        await user.type(screen.getByLabelText(/Password/), 'password');
        await user.click(screen.getByRole('button', { name: English.login.form.sign_in_button }));

        await waitFor(() => expect(window.location.pathname).toBe('/settings'));
        expect(await screen.findByLabelText(English.settings.cards.password.labels.password_current)).toBeInTheDocument();
    });
});
