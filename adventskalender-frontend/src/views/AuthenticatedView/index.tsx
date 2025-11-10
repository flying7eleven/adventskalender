import { useState, useContext, ReactElement, useEffect } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Calendar, Settings, Info } from 'lucide-react';
import { LocalizedText } from '../../components/LocalizedText';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { sessionManager } from '../../utils/SessionManager';
import { SessionExpiryWarningDialog } from '../../dialogs/SessionExpiryWarningDialog';
import { API_BACKEND_URL } from '../../api';
import { NavigationDrawer } from '../../components/NavigationDrawer';
import { AppHeader } from '../../components/AppHeader';
import { cn } from '../../lib/utils';

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

    const onClickVersion = () => {
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

    const logoutUser = () => {
        sessionManager.stopMonitoring();
        auth.signout(() => navigate('/'));
    };

    const handleExtendSession = () => {
        // Close the warning dialog
        setShowExpiryWarning(false);

        // Make a request to the backend to refresh the session cookie
        // Any authenticated API call will refresh the httpOnly cookie
        fetch(`${API_BACKEND_URL}/participants/count`, {
            method: 'GET',
            credentials: 'include',
        })
            .then((response) => {
                if (response.status === 200) {
                    // Session refreshed successfully - restart monitoring
                    sessionManager.extendSession(
                        () => setShowExpiryWarning(true),
                        () => {
                            alert(localizationContext.translate('session.expired.message'));
                            logoutUser();
                        }
                    );
                } else if (response.status === 401 || response.status === 403) {
                    // Session already expired
                    alert(localizationContext.translate('session.expired.message'));
                    logoutUser();
                }
            })
            .catch(() => {
                // Error extending session - log out for safety
                alert(localizationContext.translate('session.expired.message'));
                logoutUser();
            });
    };

    const handleSessionExpired = () => {
        alert(localizationContext.translate('session.expired.message'));
        logoutUser();
    };

    // Start session monitoring when component mounts (user is authenticated)
    useEffect(() => {
        if (auth.isAuthenticated) {
            // Start monitoring the session
            sessionManager.startMonitoring(
                () => setShowExpiryWarning(true), // Show warning 5 minutes before expiry
                handleSessionExpired // Auto-logout on expiry
            );
        }

        // Cleanup: stop monitoring when component unmounts
        return () => {
            sessionManager.stopMonitoring();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.isAuthenticated]);

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
            onClick: onClickVersion,
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
                    // Base styles
                    'pt-16 p-6',
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
