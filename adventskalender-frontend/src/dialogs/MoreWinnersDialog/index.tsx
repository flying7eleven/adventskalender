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
    numberOfAlreadyPickedUsers: number;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
    pickMoreUsersHandler: () => void;
}

export const MoreWinnersDialog = (props: Props) => {
    const handleDialogClose = () => {
        props.setDialogOpenStateFunction(false);
    };

    return (
        <Dialog open={props.isOpen} onClose={handleDialogClose} aria-labelledby="more-winners-question-dialog-title" aria-describedby="more-winners-question-dialog-description">
            <DialogTitle id="more-winners-question-dialog-title">
                <LocalizedText translationKey={'dashboard.dialogs.already_picked.title'} />
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="more-winners-question-dialog-description">
                    <LocalizedText translationKey={'dashboard.dialogs.already_picked.text'} placeholder={props.numberOfAlreadyPickedUsers.toString()} />
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.pickMoreUsersHandler}>
                    <LocalizedText translationKey={'dashboard.dialogs.already_picked.accept_button'} />
                </Button>
                <Button onClick={handleDialogClose} autoFocus>
                    <LocalizedText translationKey={'dashboard.dialogs.already_picked.cancel_button'} />
                </Button>
            </DialogActions>
        </Dialog>
    );
};
