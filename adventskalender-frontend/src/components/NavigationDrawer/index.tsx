import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft } from 'lucide-react';
import { ReactNode } from 'react';

interface NavigationItem {
    key: string;
    icon: ReactNode;
    label: ReactNode;
    onClick: () => void;
    selected: boolean;
}

interface NavigationDrawerProps {
    open: boolean;
    onToggle: () => void;
    items: NavigationItem[];
    settingsItems: NavigationItem[];
}

export const NavigationDrawer = ({ open, onToggle, items, settingsItems }: NavigationDrawerProps) => {
    return (
        <aside
            className={cn(
                // Base styles
                'fixed left-0 top-0 z-[1200] h-screen bg-background border-r',
                // Transition - use cubic-bezier to match MUI 'sharp' easing
                'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.6,1)]',
                // Width based on open state
                open ? 'w-[300px]' : 'w-[57px]',
                // Overflow
                'overflow-x-hidden overflow-y-auto'
            )}
        >
            {/* Drawer Header - matches AppBar height (64px) */}
            <div className={cn('flex items-center h-16 px-2', open ? 'justify-end' : 'justify-center')}>
                <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Toggle navigation drawer">
                    <ChevronLeft className={cn('h-5 w-5 transition-transform duration-300', !open && 'rotate-180')} />
                </Button>
            </div>

            <Separator />

            {/* Navigation Items */}
            <nav className="flex flex-col gap-1 p-2">
                {items.map((item) => (
                    <Button key={item.key} variant={item.selected ? 'secondary' : 'ghost'} className={cn('justify-start', !open && 'justify-center px-2')} onClick={item.onClick}>
                        {item.icon}
                        {open && <span className="ml-3">{item.label}</span>}
                    </Button>
                ))}
            </nav>

            <Separator className="my-2" />

            {/* Settings Navigation Items */}
            <nav className="flex flex-col gap-1 p-2">
                {settingsItems.map((item) => (
                    <Button key={item.key} variant={item.selected ? 'secondary' : 'ghost'} className={cn('justify-start', !open && 'justify-center px-2')} onClick={item.onClick}>
                        {item.icon}
                        {open && <span className="ml-3">{item.label}</span>}
                    </Button>
                ))}
            </nav>
        </aside>
    );
};
