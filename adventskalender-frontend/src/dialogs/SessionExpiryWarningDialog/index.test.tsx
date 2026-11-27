import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SessionExpiryWarningDialog } from './index';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';

const renderDialog = (isOpen = true) => {
    const onExtendSession = vi.fn();
    const onLogout = vi.fn();
    render(
        <LocalizationProvider resources={{ english: English, german: English }}>
            <SessionExpiryWarningDialog isOpen={isOpen} onExtendSession={onExtendSession} onLogout={onLogout} />
        </LocalizationProvider>
    );
    return { onExtendSession, onLogout };
};

describe('SessionExpiryWarningDialog', () => {
    test('warns with a title and an explanation', () => {
        renderDialog();

        const dialog = screen.getByRole('dialog', { name: English.session.expiry_warning.title });
        expect(dialog).toHaveAccessibleDescription(/\S/);
        expect(dialog).not.toHaveTextContent('session.expiry_warning');
    });

    test('extends the session when the user stays logged in', async () => {
        const { onExtendSession, onLogout } = renderDialog();

        await userEvent.setup().click(screen.getByRole('button', { name: English.session.expiry_warning.stay_logged_in_button }));

        expect(onExtendSession).toHaveBeenCalledTimes(1);
        expect(onLogout).not.toHaveBeenCalled();
    });

    test('logs the user out when they choose to', async () => {
        const { onExtendSession, onLogout } = renderDialog();

        await userEvent.setup().click(screen.getByRole('button', { name: English.session.expiry_warning.logout_button }));

        expect(onLogout).toHaveBeenCalledTimes(1);
        expect(onExtendSession).not.toHaveBeenCalled();
    });

    test('keeps the session when the dialog is dismissed with escape', async () => {
        const { onExtendSession, onLogout } = renderDialog();

        await userEvent.setup().keyboard('{Escape}');

        expect(onExtendSession).toHaveBeenCalledTimes(1);
        expect(onLogout).not.toHaveBeenCalled();
    });

    test('stays hidden while the session is not about to expire', () => {
        renderDialog(false);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
