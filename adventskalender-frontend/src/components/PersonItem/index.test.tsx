import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { PersonItem } from './index';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import { API_BACKEND_URL, WinnerInformation } from '../../api';

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
    Toaster: () => null,
}));

const renderItem = (winner: WinnerInformation, updateWinnerList = vi.fn()) => {
    render(
        <MemoryRouter>
            <AuthenticationProvider>
                <LocalizationProvider resources={{ english: English, german: English }}>
                    <PersonItem winner={winner} winningDay={6} updateWinnerList={updateWinnerList} />
                </LocalizationProvider>
            </AuthenticationProvider>
        </MemoryRouter>
    );
    return updateWinnerList;
};

const deleteCalls = () => vi.mocked(global.fetch).mock.calls.filter(([, init]) => init?.method === 'DELETE');

describe('PersonItem', () => {
    beforeEach(() => {
        global.fetch = vi.fn().mockImplementation((url: string) =>
            Promise.resolve({
                status: url.endsWith('/auth/me') ? 200 : 204,
                ok: true,
                json: () => Promise.resolve({ username: 'test', expires_in: 60 * 60 }),
            } as Response)
        );
    });

    test('shows the winner with the door number and package', () => {
        renderItem({ id: 1, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: 'A' });

        expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
        expect(screen.getByText('6A')).toBeInTheDocument();
    });

    test('shows only the door number while the package is missing', () => {
        renderItem({ id: 1, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: null });

        expect(screen.getByText('6')).toBeInTheDocument();
        expect(screen.queryByText(/null|undefined/)).not.toBeInTheDocument();
    });

    test('abbreviates middle names', () => {
        renderItem({ id: 1, firstName: 'Anna Maria', lastName: 'Schmidt', presentIdentifier: 'B' });

        expect(screen.getByText('Anna M. Schmidt')).toBeInTheDocument();
    });

    test('removes the winner after the full name was confirmed', async () => {
        const updateWinnerList = renderItem({ id: 42, firstName: 'Anna Maria', lastName: 'Schmidt', presentIdentifier: 'B' });
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/auth/me`, expect.anything()));
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: English.calendar.cards.winners.button_remove }));
        const dialog = await screen.findByRole('dialog', { name: English.calendar.dialogs.remove_participant.title });
        expect(dialog).toHaveTextContent('Anna Maria Schmidt');
        expect(deleteCalls()).toHaveLength(0);

        await user.click(screen.getByRole('button', { name: English.calendar.dialogs.remove_participant.accept_button }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`${API_BACKEND_URL}/participants/won/42`, expect.objectContaining({ method: 'DELETE' })));
        await waitFor(() => expect(updateWinnerList).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('keeps the winner when the removal is cancelled', async () => {
        const updateWinnerList = renderItem({ id: 42, firstName: 'Max', lastName: 'Mustermann', presentIdentifier: 'A' });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: English.calendar.cards.winners.button_remove }));
        await user.click(await screen.findByRole('button', { name: English.calendar.dialogs.remove_participant.cancel_button }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(deleteCalls()).toHaveLength(0);
        expect(updateWinnerList).not.toHaveBeenCalled();
    });
});
