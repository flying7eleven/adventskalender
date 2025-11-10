import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LocalizedText } from '../../components/LocalizedText';
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
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && handleDialogClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        <LocalizedText translationKey={'dashboard.dialogs.no_participants_left.title'} />
                    </DialogTitle>
                    <DialogDescription>
                        <LocalizedText translationKey={'dashboard.dialogs.no_participants_left.text'} />
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={handleDialogClose}>
                        <LocalizedText translationKey={'dashboard.dialogs.no_participants_left.accept_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
