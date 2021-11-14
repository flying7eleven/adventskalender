import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { MouseEventHandler, useContext } from 'react';
import { LocalizationContext } from '../LocalizationProvider';
import { useNavigate, useLocation } from 'react-router-dom';

interface Props {
    open: boolean;
    toggleDrawerOpen: (shouldBeOpen: boolean) => MouseEventHandler;
}

export const SideDrawer = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);
    const navigate = useNavigate();
    const location = useLocation();

    const onClickOnDashboard = () => {
        navigate('/');
    };

    const onClickOnCalendar = () => {
        navigate('/calendar');
    };

    const isSelected = (url: string) => {
        return location.pathname === url;
    };

    const list = () => (
        <Box sx={{ width: 250 }} role="presentation" onClick={props.toggleDrawerOpen(false)}>
            <List>
                <ListItem button key={'Dashboard'} onClick={onClickOnDashboard} selected={isSelected('/')}>
                    <ListItemIcon>
                        <DashboardIcon />
                    </ListItemIcon>
                    <ListItemText primary={localizationContext.translate('global.navigation.dashboard')} />
                </ListItem>
                <ListItem button key={'Calendar'} onClick={onClickOnCalendar} selected={isSelected('/calendar')}>
                    <ListItemIcon>
                        <CalendarTodayIcon />
                    </ListItemIcon>
                    <ListItemText primary={localizationContext.translate('global.navigation.calendar')} />
                </ListItem>
            </List>
        </Box>
    );

    return (
        <>
            <Drawer anchor={'left'} open={props.open} onClose={props.toggleDrawerOpen(false)}>
                {list()}
            </Drawer>
        </>
    );
};
