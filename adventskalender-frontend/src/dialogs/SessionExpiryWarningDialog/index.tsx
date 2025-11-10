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
import { useContext } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';

interface Props {
    isOpen: boolean;
    onExtendSession: () => void;
    onLogout: () => void;
}

export const SessionExpiryWarningDialog = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onExtendSession()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        <LocalizedText translationKey={'session.expiry_warning.title'} />
                    </DialogTitle>
                    <DialogDescription>
                        {localizationContext.translate('session.expiry_warning.message')}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                    <Button
                        variant="destructive"
                        onClick={props.onLogout}
                    >
                        <LocalizedText translationKey={'session.expiry_warning.logout_button'} />
                    </Button>
                    <Button
                        onClick={props.onExtendSession}
                    >
                        <LocalizedText translationKey={'session.expiry_warning.stay_logged_in_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
