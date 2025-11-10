import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import { LocalizedText } from '../../components/LocalizedText';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import { Button } from '@/components/ui/button';
import { Dispatch, SetStateAction } from 'react';

interface Props {
    isOpen: boolean;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
}

export const NoParticipantsErrorDialog = (props: Props) => {
    const handleDialogClose = () => {
        props.setDialogOpenStateFunction(false);
    };

    return (
        <Dialog open={props.isOpen} onClose={handleDialogClose} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
            <DialogTitle id="alert-dialog-title">
                <LocalizedText translationKey={'dashboard.dialogs.no_participants_left.title'} />
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="alert-dialog-description">
                    <LocalizedText translationKey={'dashboard.dialogs.no_participants_left.text'} />
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleDialogClose} autoFocus>
                    <LocalizedText translationKey={'dashboard.dialogs.no_participants_left.accept_button'} />
                </Button>
            </DialogActions>
        </Dialog>
    );
};
