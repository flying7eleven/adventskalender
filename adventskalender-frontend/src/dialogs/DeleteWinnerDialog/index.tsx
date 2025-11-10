import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LocalizedText } from '../../components/LocalizedText';
import { Dispatch, SetStateAction, useContext } from 'react';
import { API_BACKEND_URL, WinnerInformation } from '../../api.ts';
import { LocalizationContext } from '../../provider/LocalizationContext';
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
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        // since we have a token, we can query the backend for the winner count for the selected day
        fetch(`${API_BACKEND_URL}/participants/won/${props.userToDelete.id}`, {
            method: 'DELETE',
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
            credentials: 'include',
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
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.setDialogOpenStateFunction(false)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        <LocalizedText translationKey={'calendar.dialogs.remove_participant.title'} />
                    </DialogTitle>
                    <DialogDescription>
                        {localizationContext.translate('calendar.dialogs.remove_participant.text').replace('{0}', `${props.userToDelete.firstName} ${props.userToDelete.lastName}`)}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => props.setDialogOpenStateFunction(false)}>
                        <LocalizedText translationKey={'calendar.dialogs.remove_participant.cancel_button'} />
                    </Button>
                    <Button variant="destructive" onClick={handleRemoveParticipant}>
                        <LocalizedText translationKey={'calendar.dialogs.remove_participant.accept_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
