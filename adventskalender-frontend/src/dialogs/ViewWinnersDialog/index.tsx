import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LocalizedText } from '../../components/LocalizedText';
import { WinnerInformation } from '../../api.ts';
import { useContext } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { format, parse } from 'date-fns';
import { de } from 'date-fns/locale';

interface Props {
    winningDate: string;
    listOfWinner: WinnerInformation[];
    isOpen: boolean;
    onClose: () => void;
}

export const SpecialTextItem = ({ date }: { date: string }) => {
    const parsedDate = parse(date, 'yyyy-MM-dd', new Date());
    const winningDay = format(parsedDate, 'd');
    switch (winningDay) {
        case '6':
            return <LocalizedText translationKey={'dashboard.dialogs.new_winners.title2_special1'} variables={[winningDay]} />;
        case '24':
            return <LocalizedText translationKey={'dashboard.dialogs.new_winners.title2_special2'} variables={[winningDay]} />;
        default:
            return <LocalizedText translationKey={'dashboard.dialogs.new_winners.title2'} variables={[winningDay]} />;
    }
};

export const ViewWinnersDialog = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);

    const renderWinnerText = () => {
        const parsedDate = parse(props.winningDate, 'yyyy-MM-dd', new Date());
        // Determine locale based on browser language (German or English)
        const locale = window.navigator.language.startsWith('de') ? de : undefined;
        const winningDate = format(parsedDate, localizationContext.translate('dashboard.dialogs.new_winners.date_format'), { locale });
        const winningDay = format(parsedDate, 'd');

        // Sort winners by package identifier
        const sortedWinners = [...props.listOfWinner].sort((a, b) => {
            const packageA = a.presentIdentifier || '?';
            const packageB = b.presentIdentifier || '?';
            return packageA > packageB ? 1 : -1;
        });

        return (
            <>
                {localizationContext.translate('dashboard.dialogs.new_winners.winner_paragraph_prefix')} {winningDate}:{' '}
                {sortedWinners.map((winner, index) => {
                    return (
                        <span key={index}>
                            {index > 0 && ', '}
                            <strong>
                                {winner.firstName} {winner.lastName}
                            </strong>{' '}
                            ({winningDay}
                            {winner.presentIdentifier})
                        </span>
                    );
                })}
            </>
        );
    };

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        <SpecialTextItem date={props.winningDate} />
                    </DialogTitle>
                </DialogHeader>
                <div className="text-sm text-foreground">{renderWinnerText()}</div>
                <DialogFooter>
                    <Button onClick={props.onClose}>
                        <LocalizedText translationKey={'dashboard.dialogs.new_winners.finish_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
