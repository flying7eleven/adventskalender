import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import { LocalizedText } from '../../components/LocalizedText';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { Dispatch, SetStateAction, useContext } from 'react';
import { API_BACKEND_URL, WinnerInformation } from '../../api.ts';
import { LocalizationContext } from '../../provider/LocalizationProvider';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';

interface Props {
    isOpen: boolean;
    userToDelete: WinnerInformation;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
    updateWinnerList?: () => void;
}

export const DeleteWinnerDialog = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);
    const auth = useAuthentication();
    const navigate = useNavigate();

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const handleRemoveParticipant = () => {
        // if we do not have an access token, skip fetching the infos
        if (auth.token.accessToken.length === 0) {
            return;
        }

        // since we have a token, we can query the backend for the winner count for the selected day
        fetch(`${API_BACKEND_URL}/participants/won/${props.userToDelete.id}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${auth.token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => {
                // if we got a valid response from the backend, it should be JSON. We can convert it to a valid JSON
                // object and proceed processing it
                if (res.status === 204) {
                    return;
                }

                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (res.status === 401 || res.status === 403) {
                    logoutUser();
                    return Promise.reject();
                }

                // there should never be other status codes which have to be handled, but just in case, we'll handle
                // them here too
                // TODO: this
            })
            .then(() => {
                if (props.updateWinnerList) {
                    props.updateWinnerList();
                }
                props.setDialogOpenStateFunction(false);
            })
            .catch(() => {
                // TODO: handle errors
            });
    };

    return (
        <Dialog
            open={props.isOpen}
            onClose={() => props.setDialogOpenStateFunction(false)}
            aria-labelledby="alert-dialog-remove-participant-title"
            aria-describedby="alert-dialog-remove-participant-description"
        >
            <DialogTitle id="alert-dialog-remove-participant-title">
                <LocalizedText translationKey={'calendar.dialogs.remove_participant.title'} />
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="alert-dialog-remove-participant-description">
                    {localizationContext.translate('calendar.dialogs.remove_participant.text').replace('{0}', `${props.userToDelete.firstName} ${props.userToDelete.lastName}`)}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleRemoveParticipant} color={'error'}>
                    <LocalizedText translationKey={'calendar.dialogs.remove_participant.accept_button'} />
                </Button>
                <Button onClick={() => props.setDialogOpenStateFunction(false)} autoFocus>
                    <LocalizedText translationKey={'calendar.dialogs.remove_participant.cancel_button'} />
                </Button>
            </DialogActions>
        </Dialog>
    );
};
