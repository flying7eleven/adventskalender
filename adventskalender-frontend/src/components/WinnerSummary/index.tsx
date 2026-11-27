import { useContext } from 'react';
import { format, parse } from 'date-fns';
import { LocalizedText } from '../LocalizedText';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { WinnerInformation } from '../../api';

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

export const WinnerSummary = ({ date, winners }: { date: string; winners: WinnerInformation[] }) => {
    const localizationContext = useContext(LocalizationContext);
    const parsedDate = parse(date, 'yyyy-MM-dd', new Date());
    const winningDate = format(parsedDate, localizationContext.translate('dashboard.dialogs.new_winners.date_format'), { locale: localizationContext.dateLocale });
    const winningDay = format(parsedDate, 'd');

    const sortedWinners = [...winners].sort((a, b) => {
        const packageA = a.presentIdentifier || '?';
        const packageB = b.presentIdentifier || '?';
        return packageA > packageB ? 1 : -1;
    });

    return (
        <>
            {localizationContext.translate('dashboard.dialogs.new_winners.winner_paragraph_prefix')} {winningDate}:{' '}
            {sortedWinners.map((winner, index) => (
                <span key={index}>
                    {index > 0 && ', '}
                    <strong>
                        {winner.firstName} {winner.lastName}
                    </strong>{' '}
                    ({winningDay}
                    {winner.presentIdentifier})
                </span>
            ))}
        </>
    );
};
