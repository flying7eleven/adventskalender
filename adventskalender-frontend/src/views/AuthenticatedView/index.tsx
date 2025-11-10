import { useState, useContext, ReactElement, useEffect } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useLocation, useNavigate } from 'react-router-dom';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { Box, Divider, IconButton, Stack, Toolbar, Typography } from '@mui/material';
import MuiAppBar, { AppBarProps as MuiAppBarProps } from '@mui/material/AppBar';
import MuiDrawer from '@mui/material/Drawer';
import { styled, Theme, CSSObject } from '@mui/material/styles';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ListItemText from '@mui/material/ListItemText';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import MenuIcon from '@mui/icons-material/Menu';
import { Button } from '@/components/ui/button';
import { LocalizedText } from '../../components/LocalizedText';
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { sessionManager } from '../../utils/SessionManager';
import { SessionExpiryWarningDialog } from '../../dialogs/SessionExpiryWarningDialog';
import { API_BACKEND_URL } from '../../api';

interface Props {
    content: ReactElement;
}

const drawerWidth = 300;

const openedMixin = (theme: Theme): CSSObject => ({
    width: drawerWidth,
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
    }),
    overflowX: 'hidden',
});

const closedMixin = (theme: Theme): CSSObject => ({
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    overflowX: 'hidden',
    width: `calc(${theme.spacing(7)} + 1px)`,
});

const DrawerHeader = styled('div')(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: theme.spacing(0, 1),
    // necessary for content to be below app bar
    ...theme.mixins.toolbar,
}));

const Drawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== 'open' })(({ theme, open }) => ({
    width: drawerWidth,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...(open && {
        ...openedMixin(theme),
        '& .MuiDrawer-paper': openedMixin(theme),
    }),
    ...(!open && {
        ...closedMixin(theme),
        '& .MuiDrawer-paper': closedMixin(theme),
    }),
}));

interface AppBarProps extends MuiAppBarProps {
    open?: boolean;
}

const AppBar = styled(MuiAppBar, {
    shouldForwardProp: (prop) => prop !== 'open',
})<AppBarProps>(({ theme, open }) => ({
    zIndex: theme.zIndex.drawer + 1,
    transition: theme.transitions.create(['width', 'margin'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    ...(open && {
        marginLeft: drawerWidth,
        width: `calc(100% - ${drawerWidth}px)`,
        transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
        }),
    }),
}));

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

    return (
        <>
            <SessionExpiryWarningDialog isOpen={showExpiryWarning} onExtendSession={handleExtendSession} onLogout={logoutUser} />
            <Stack>
                <AppBar position="fixed" open={navigationDrawerOpen}>
                    <Toolbar>
                        <IconButton size="large" edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }} onClick={toggleDrawer}>
                            <MenuIcon />
                        </IconButton>
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                            <LocalizedText translationKey={'dashboard.navigation.app_title'} />
                        </Typography>
                        <Button variant="ghost" onClick={logoutUser} className="text-inherit">
                            <LocalizedText translationKey={'dashboard.navigation.logout_button'} />
                        </Button>
                    </Toolbar>
                </AppBar>
                <Drawer variant="permanent" open={navigationDrawerOpen}>
                    <DrawerHeader>
                        <IconButton onClick={toggleDrawer}>
                            <ChevronLeftIcon />
                        </IconButton>
                    </DrawerHeader>
                    <Divider />
                    <List>
                        <ListItem disablePadding>
                            <ListItemButton key={'Dashboard'} onClick={onClickOnDashboard} selected={isSelected('/')}>
                                <ListItemIcon>
                                    <DashboardIcon />
                                </ListItemIcon>
                                <ListItemText primary={localizationContext.translate('global.navigation.dashboard')} />
                            </ListItemButton>
                        </ListItem>
                        <ListItem disablePadding>
                            <ListItemButton key={'Calendar'} onClick={onClickOnCalendar} selected={isSelected('/calendar')}>
                                <ListItemIcon>
                                    <CalendarTodayIcon />
                                </ListItemIcon>
                                <ListItemText primary={localizationContext.translate('global.navigation.calendar')} />
                            </ListItemButton>
                        </ListItem>
                        <Divider />
                        <ListItem disablePadding>
                            <ListItemButton key={'Settings'} onClick={onClickSettings} selected={isSelected('/settings')}>
                                <ListItemIcon>
                                    <SettingsIcon />
                                </ListItemIcon>
                                <ListItemText primary={localizationContext.translate('global.navigation.settings')} />
                            </ListItemButton>
                        </ListItem>
                        <ListItem disablePadding>
                            <ListItemButton key={'Version'} onClick={onClickVersion} selected={isSelected('/version')}>
                                <ListItemIcon>
                                    <InfoIcon />
                                </ListItemIcon>
                                <ListItemText primary={localizationContext.translate('global.navigation.version')} />
                            </ListItemButton>
                        </ListItem>
                    </List>
                </Drawer>
                <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
                    <DrawerHeader />
                    {props.content}
                </Box>
            </Stack>
        </>
    );
};
