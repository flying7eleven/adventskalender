import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import { LocalizedText } from '../../components/LocalizedText';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { Dispatch, SetStateAction } from 'react';

interface Props {
    isOpen: boolean;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
}

export const PasswordChangedDialog = (props: Props) => {
    return (
        <Dialog open={props.isOpen} onClose={() => props.setDialogOpenStateFunction(false)} aria-labelledby="alert-dialog-title-successful" aria-describedby="alert-dialog-description-successful">
            <DialogTitle id="alert-dialog-title-successful">
                <LocalizedText translationKey={'settings.dialogs.password_change_successful.title'} />
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="alert-dialog-description-successful">
                    <LocalizedText translationKey={'settings.dialogs.password_change_successful.text'} />
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.setDialogOpenStateFunction(false)} autoFocus>
                    <LocalizedText translationKey={'settings.dialogs.password_change_successful.accept_button'} />
                </Button>
            </DialogActions>
        </Dialog>
    );
};
