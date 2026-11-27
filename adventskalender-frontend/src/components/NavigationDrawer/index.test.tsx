import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { NavigationDrawer } from './index';

const createItems = () => ({
    items: [
        { key: 'Dashboard', icon: <svg />, label: 'Dashboard', onClick: vi.fn(), selected: true },
        { key: 'Calendar', icon: <svg />, label: 'Calendar', onClick: vi.fn(), selected: false },
    ],
    settingsItems: [
        { key: 'Settings', icon: <svg />, label: 'Settings', onClick: vi.fn(), selected: false },
        { key: 'Version', icon: <svg />, label: 'Version', onClick: vi.fn(), selected: false },
    ],
});

describe('NavigationDrawer', () => {
    test('navigates with the clicked entry only', async () => {
        const { items, settingsItems } = createItems();
        render(<NavigationDrawer open={true} onToggle={vi.fn()} items={items} settingsItems={settingsItems} />);
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Calendar' }));
        await user.click(screen.getByRole('button', { name: 'Version' }));

        expect(items[1].onClick).toHaveBeenCalledTimes(1);
        expect(settingsItems[1].onClick).toHaveBeenCalledTimes(1);
        expect(items[0].onClick).not.toHaveBeenCalled();
        expect(settingsItems[0].onClick).not.toHaveBeenCalled();
    });

    test('hides the labels when collapsed but keeps every entry clickable', async () => {
        const { items, settingsItems } = createItems();
        render(<NavigationDrawer open={false} onToggle={vi.fn()} items={items} settingsItems={settingsItems} />);
        const user = userEvent.setup();

        expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
        expect(screen.queryByText('Settings')).not.toBeInTheDocument();

        const toggle = screen.getByRole('button', { name: 'Toggle navigation drawer' });
        const entries = screen.getAllByRole('button').filter((button) => button !== toggle);
        expect(entries).toHaveLength(4);
        for (const entry of entries) {
            await user.click(entry);
        }

        for (const item of [...items, ...settingsItems]) {
            expect(item.onClick).toHaveBeenCalledTimes(1);
        }
    });

    test('toggles with its toggle button without navigating', async () => {
        const { items, settingsItems } = createItems();
        const onToggle = vi.fn();
        render(<NavigationDrawer open={true} onToggle={onToggle} items={items} settingsItems={settingsItems} />);

        await userEvent.setup().click(screen.getByRole('button', { name: 'Toggle navigation drawer' }));

        expect(onToggle).toHaveBeenCalledTimes(1);
        for (const item of [...items, ...settingsItems]) {
            expect(item.onClick).not.toHaveBeenCalled();
        }
    });
});
