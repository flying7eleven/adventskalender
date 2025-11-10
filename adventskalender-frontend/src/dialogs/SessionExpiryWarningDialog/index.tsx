import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import { Button } from '@/components/ui/button';
import { LocalizedText } from '../../components/LocalizedText';
import { useContext } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';

interface Props {
    isOpen: boolean;
    onExtendSession: () => void;
    onLogout: () => void;
}

export const SessionExpiryWarningDialog = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);

    return (
        <Dialog open={props.isOpen} onClose={props.onExtendSession} aria-labelledby="session-expiry-warning-dialog-title" aria-describedby="session-expiry-warning-dialog-description">
            <DialogTitle id="session-expiry-warning-dialog-title">
                <LocalizedText translationKey={'session.expiry_warning.title'} />
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="session-expiry-warning-dialog-description">{localizationContext.translate('session.expiry_warning.message')}</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onLogout} variant="destructive">
                    <LocalizedText translationKey={'session.expiry_warning.logout_button'} />
                </Button>
                <Button onClick={props.onExtendSession} variant="default" autoFocus>
                    <LocalizedText translationKey={'session.expiry_warning.stay_logged_in_button'} />
                </Button>
            </DialogActions>
        </Dialog>
    );
};
