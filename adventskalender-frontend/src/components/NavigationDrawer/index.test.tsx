import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { NavigationDrawer } from './index';
import { LocalizationProvider } from '../../provider/LocalizationProvider';
import English from '../../languages/en.json';
import German from '../../languages/de.json';

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

const renderDrawer = ({ open, onToggle = vi.fn() }: { open: boolean; onToggle?: () => void }) => {
    const { items, settingsItems } = createItems();
    render(
        <LocalizationProvider resources={{ english: English, german: German }}>
            <NavigationDrawer open={open} onToggle={onToggle} items={items} settingsItems={settingsItems} />
        </LocalizationProvider>
    );
    return { items, settingsItems };
};

describe('NavigationDrawer', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('navigates with the clicked entry only', async () => {
        const { items, settingsItems } = renderDrawer({ open: true });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Calendar' }));
        await user.click(screen.getByRole('button', { name: 'Version' }));

        expect(items[1].onClick).toHaveBeenCalledTimes(1);
        expect(settingsItems[1].onClick).toHaveBeenCalledTimes(1);
        expect(items[0].onClick).not.toHaveBeenCalled();
        expect(settingsItems[0].onClick).not.toHaveBeenCalled();
    });

    test('hides the labels when collapsed but keeps every entry reachable by its name', async () => {
        const { items, settingsItems } = renderDrawer({ open: false });
        const user = userEvent.setup();

        expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
        expect(screen.queryByText('Settings')).not.toBeInTheDocument();

        for (const item of [...items, ...settingsItems]) {
            await user.click(screen.getByRole('button', { name: item.label }));
            expect(item.onClick).toHaveBeenCalledTimes(1);
        }
    });

    test('toggles with its toggle button without navigating', async () => {
        const onToggle = vi.fn();
        const { items, settingsItems } = renderDrawer({ open: true, onToggle });

        await userEvent.setup().click(screen.getByRole('button', { name: English.global.navigation_buttons.toggle_drawer }));

        expect(onToggle).toHaveBeenCalledTimes(1);
        for (const item of [...items, ...settingsItems]) {
            expect(item.onClick).not.toHaveBeenCalled();
        }
    });

    test('names the toggle button in German for German browsers', () => {
        vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('de-DE');
        renderDrawer({ open: false });

        expect(screen.getByRole('button', { name: German.global.navigation_buttons.toggle_drawer })).toBeInTheDocument();
    });
});
