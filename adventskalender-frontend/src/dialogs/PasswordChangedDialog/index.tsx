import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LocalizedText } from '../../components/LocalizedText';
import { Dispatch, SetStateAction } from 'react';

interface Props {
    isOpen: boolean;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
}

export const PasswordChangedDialog = (props: Props) => {
    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.setDialogOpenStateFunction(false)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        <LocalizedText translationKey={'settings.dialogs.password_change_successful.title'} />
                    </DialogTitle>
                    <DialogDescription>
                        <LocalizedText translationKey={'settings.dialogs.password_change_successful.text'} />
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={() => props.setDialogOpenStateFunction(false)}>
                        <LocalizedText translationKey={'settings.dialogs.password_change_successful.accept_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
