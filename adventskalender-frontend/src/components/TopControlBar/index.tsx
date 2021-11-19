import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';

interface Props {
    title: string;
    actionTitle: string;
    actionHandler?: () => void;
    burgerHandle?: () => void;
}

export const TopControlBar = (props: Props) => {
    const handleActionButtonClick = () => {
        if (props.actionHandler) {
            props.actionHandler();
        }
    };

    const handleBurgerButtonClick = () => {
        if (props.burgerHandle) {
            props.burgerHandle();
        }
    };

    return (
        <Box sx={{ flexGrow: 1, paddingBottom: '32px' }}>
            <AppBar position="static">
                <Toolbar>
                    <IconButton size="large" edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }} onClick={handleBurgerButtonClick}>
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        {props.title}
                    </Typography>
                    <Button color="inherit" onClick={handleActionButtonClick}>
                        {props.actionTitle}
                    </Button>
                </Toolbar>
            </AppBar>
        </Box>
    );
};
