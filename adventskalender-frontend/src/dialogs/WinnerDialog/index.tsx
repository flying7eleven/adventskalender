import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import { LocalizedText } from '../../components/LocalizedText';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { Dispatch, SetStateAction } from 'react';

interface Props {
    winner: WinnerInformation[];
    isOpen: boolean;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
}

export const WinnerDialog = (props: Props) => {
    const handleDialogClose = () => {
        props.setDialogOpenStateFunction(false);
    };

    return (
        <Dialog open={props.isOpen} onClose={handleDialogClose} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
            <DialogTitle id="alert-dialog-title">
                <LocalizedText translationKey={'dashboard.dialogs.new_winners.title'} />
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="alert-dialog-description">
                    <LocalizedText translationKey={'dashboard.dialogs.new_winners.text'} />
                    <ul>TODO</ul>
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleDialogClose} autoFocus>
                    <LocalizedText translationKey={'dashboard.dialogs.new_winners.accept_button'} />
                </Button>
            </DialogActions>
        </Dialog>
    );
};
