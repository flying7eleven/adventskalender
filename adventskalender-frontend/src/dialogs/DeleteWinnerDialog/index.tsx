import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LocalizedText } from '../../components/LocalizedText';
import { Dispatch, SetStateAction, useContext } from 'react';
import { ApiAuthExpiredError, apiFetch, WinnerInformation } from '../../api.ts';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

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

        // since we have a token, we can remove the winning state of the participant
        apiFetch(`/participants/won/${props.userToDelete.id}`, { method: 'DELETE' })
            .then(() => {
                if (props.updateWinnerList) {
                    props.updateWinnerList();
                }
                props.setDialogOpenStateFunction(false);
            })
            .catch((error: unknown) => {
                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (error instanceof ApiAuthExpiredError) {
                    logoutUser();
                    return;
                }
                toast.error(localizationContext.translate('calendar.dialogs.remove_participant.error'), {
                    duration: 6000,
                });
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
                        {localizationContext.translate('calendar.dialogs.remove_participant.text', [`${props.userToDelete.firstName} ${props.userToDelete.lastName}`])}
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
