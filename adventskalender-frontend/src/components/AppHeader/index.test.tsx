import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AppHeader } from './index';

const renderHeader = () => {
    const onMenuClick = vi.fn();
    const onLogout = vi.fn();
    render(<AppHeader open={false} onMenuClick={onMenuClick} onLogout={onLogout} title="Adventskalender" logoutLabel="Logout" />);
    return { onMenuClick, onLogout };
};

describe('AppHeader', () => {
    test('shows the title as the page heading', () => {
        renderHeader();

        expect(screen.getByRole('heading', { name: 'Adventskalender' })).toBeInTheDocument();
    });

    test('opens the navigation with the menu button', async () => {
        const { onMenuClick, onLogout } = renderHeader();

        await userEvent.setup().click(screen.getByRole('button', { name: 'Open navigation menu' }));

        expect(onMenuClick).toHaveBeenCalledTimes(1);
        expect(onLogout).not.toHaveBeenCalled();
    });

    test('logs out with the logout button', async () => {
        const { onMenuClick, onLogout } = renderHeader();

        await userEvent.setup().click(screen.getByRole('button', { name: 'Logout' }));

        expect(onLogout).toHaveBeenCalledTimes(1);
        expect(onMenuClick).not.toHaveBeenCalled();
    });
});
