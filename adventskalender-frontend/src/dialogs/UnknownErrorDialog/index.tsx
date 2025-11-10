import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LocalizedText } from '../../components/LocalizedText';
import { Dispatch, SetStateAction } from 'react';

interface Props {
    isOpen: boolean;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
}

export const UnknownErrorDialog = (props: Props) => {
    const handleDialogClose = () => {
        props.setDialogOpenStateFunction(false);
    };

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && handleDialogClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        <LocalizedText translationKey={'dashboard.dialogs.unknown_error.title'} />
                    </DialogTitle>
                    <DialogDescription>
                        <LocalizedText translationKey={'dashboard.dialogs.unknown_error.text'} />
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={handleDialogClose}>
                        <LocalizedText translationKey={'dashboard.dialogs.unknown_error.accept_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
