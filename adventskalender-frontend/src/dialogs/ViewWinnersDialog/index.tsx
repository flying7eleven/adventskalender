import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LocalizedText } from '../../components/LocalizedText';
import { SpecialTextItem, WinnerSummary } from '../../components/WinnerSummary';
import { WinnerInformation } from '../../api.ts';

interface Props {
    winningDate: string;
    listOfWinner: WinnerInformation[];
    isOpen: boolean;
    onClose: () => void;
}

export const ViewWinnersDialog = (props: Props) => {
    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        <SpecialTextItem date={props.winningDate} />
                    </DialogTitle>
                </DialogHeader>
                <div className="text-sm text-foreground">
                    <WinnerSummary date={props.winningDate} winners={props.listOfWinner} />
                </div>
                <DialogFooter>
                    <Button onClick={props.onClose}>
                        <LocalizedText translationKey={'dashboard.dialogs.new_winners.finish_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
