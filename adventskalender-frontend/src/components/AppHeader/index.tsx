import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';

interface AppHeaderProps {
    open: boolean;
    onMenuClick: () => void;
    onLogout: () => void;
    title: ReactNode;
    logoutLabel: ReactNode;
}

export const AppHeader = ({ open, onMenuClick, onLogout, title, logoutLabel }: AppHeaderProps) => {
    return (
        <header
            className={cn(
                // Base styles
                'fixed top-0 right-0 z-[1201] flex items-center justify-between',
                'h-16 bg-primary text-primary-foreground border-b shadow-sm',
                // Transition - matches drawer animation
                'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.6,1)]',
                // Width and margin based on drawer state
                open ? 'left-[300px]' : 'left-[57px]'
            )}
        >
            <div className="flex items-center px-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onMenuClick}
                    className="text-primary-foreground hover:bg-primary-foreground/10"
                    aria-label="Open navigation menu"
                >
                    <Menu className="h-5 w-5" />
                </Button>
                <h1 className="ml-4 text-lg font-semibold">{title}</h1>
            </div>
            <div className="flex items-center gap-2 px-4">
                <ThemeToggle />
                <Button variant="ghost" onClick={onLogout} className="text-primary-foreground hover:bg-primary-foreground/10">
                    {logoutLabel}
                </Button>
            </div>
        </header>
    );
};
