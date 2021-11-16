import { useState, useContext, ReactElement } from 'react';
import { TopControlBar } from '../../components/TopControlBar';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { LocalizationContext } from '../../components/LocalizationProvider';
import { SideDrawer } from '../../components/SideDrawer';
import { Stack } from '@mui/material';

interface Props {
    content: ReactElement;
}

export const AuthenticatedView = (props: Props) => {
    const [navigationDrawerOpen, setNavigationDrawerOpen] = useState<boolean>(false);
    const auth = useAuthentication();
    const navigate = useNavigate();
    const localizationContext = useContext(LocalizationContext);

    const toggleDrawerEventClickHandler = (shouldBeOpen: boolean) => () => {
        setNavigationDrawerOpen(shouldBeOpen);
    };

    const toggleDrawer = () => {
        setNavigationDrawerOpen(!navigationDrawerOpen);
    };

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    return (
        <Stack spacing={2}>
            <SideDrawer open={navigationDrawerOpen} toggleDrawerOpen={toggleDrawerEventClickHandler} />
            <TopControlBar
                title={localizationContext.translate('dashboard.navigation.app_title')}
                actionTitle={localizationContext.translate('dashboard.navigation.logout_button')}
                actionHandler={logoutUser}
                burgerHandle={toggleDrawer}
            />
            {props.content}
        </Stack>
    );
};
