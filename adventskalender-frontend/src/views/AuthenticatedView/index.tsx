import { useState, useContext, ReactElement, useEffect, useRef } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Calendar, Settings, Info } from 'lucide-react';
import { LocalizedText } from '../../components/LocalizedText';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { sessionManager } from '../../utils/SessionManager';
import { SessionExpiryWarningDialog } from '../../dialogs/SessionExpiryWarningDialog';
import { NavigationDrawer } from '../../components/NavigationDrawer';
import { AppHeader } from '../../components/AppHeader';
import { cn } from '@/lib/utils';

interface Props {
    content: ReactElement;
}

export const AuthenticatedView = (props: Props) => {
    const [navigationDrawerOpen, setNavigationDrawerOpen] = useState<boolean>(false);
    const [showExpiryWarning, setShowExpiryWarning] = useState<boolean>(false);
    const auth = useAuthentication();
    const navigate = useNavigate();
    const location = useLocation();
    const localizationContext = useContext(LocalizationContext);

    const onClickOnDashboard = () => {
        navigate('/');
    };

    const onClickOnCalendar = () => {
        navigate('/calendar');
    };

    const onClickOnVersion = () => {
        navigate('/version');
    };

    const onClickSettings = () => {
        navigate('/settings');
    };

    const isSelected = (url: string) => {
        return location.pathname === url;
    };

    const toggleDrawer = () => {
        setNavigationDrawerOpen(!navigationDrawerOpen);
    };

    const sessionExpiredRef = useRef(false);

    const logoutUser = () => {
        sessionManager.stopMonitoring();
        auth.signout(() => navigate('/'));
    };

    const handleSessionExpired = () => {
        if (sessionExpiredRef.current) {
            return;
        }
        sessionExpiredRef.current = true;
        alert(localizationContext.translate('session.expired.message'));
        logoutUser();
    };

    const handleExtendSession = () => {
        // Close the warning dialog
        setShowExpiryWarning(false);

        // Ask the backend to re-issue the auth cookie; on success reschedule the
        // warning and expiry against the new expiry reported by the backend
        auth.refresh(
            () => undefined,
            () => handleSessionExpired()
        );
    };

    // Start session monitoring when component mounts (user is authenticated)
    useEffect(() => {
        if (auth.isAuthenticated && auth.expiresAt) {
            sessionManager.startMonitoring(auth.expiresAt, () => setShowExpiryWarning(true), handleSessionExpired);
        }

        // Cleanup: stop monitoring when component unmounts
        return () => {
            sessionManager.stopMonitoring();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.isAuthenticated, auth.expiresAt]);

    // Define navigation items
    const mainNavItems = [
        {
            key: 'Dashboard',
            icon: <LayoutDashboard className="h-5 w-5" />,
            label: <LocalizedText translationKey="global.navigation.dashboard" />,
            onClick: onClickOnDashboard,
            selected: isSelected('/'),
        },
        {
            key: 'Calendar',
            icon: <Calendar className="h-5 w-5" />,
            label: <LocalizedText translationKey="global.navigation.calendar" />,
            onClick: onClickOnCalendar,
            selected: isSelected('/calendar'),
        },
    ];

    const settingsNavItems = [
        {
            key: 'Settings',
            icon: <Settings className="h-5 w-5" />,
            label: <LocalizedText translationKey="global.navigation.settings" />,
            onClick: onClickSettings,
            selected: isSelected('/settings'),
        },
        {
            key: 'Version',
            icon: <Info className="h-5 w-5" />,
            label: <LocalizedText translationKey="global.navigation.version" />,
            onClick: onClickOnVersion,
            selected: isSelected('/version'),
        },
    ];

    return (
        <>
            <SessionExpiryWarningDialog isOpen={showExpiryWarning} onExtendSession={handleExtendSession} onLogout={logoutUser} />

            <NavigationDrawer open={navigationDrawerOpen} onToggle={toggleDrawer} items={mainNavItems} settingsItems={settingsNavItems} />

            <AppHeader
                open={navigationDrawerOpen}
                onMenuClick={toggleDrawer}
                onLogout={logoutUser}
                title={<LocalizedText translationKey={'dashboard.navigation.app_title'} />}
                logoutLabel={<LocalizedText translationKey={'dashboard.navigation.logout_button'} />}
            />

            {/* Main content area */}
            <main
                className={cn(
                    // Base styles - pt-[88px] matches MUI's toolbar (64px) + p-3 (24px)
                    'pt-[88px] px-6 pb-6',
                    // Transition to match drawer/header
                    'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.6,1)]',
                    // Margin based on drawer state
                    navigationDrawerOpen ? 'ml-[300px]' : 'ml-[57px]'
                )}
            >
                {props.content}
            </main>
        </>
    );
};
