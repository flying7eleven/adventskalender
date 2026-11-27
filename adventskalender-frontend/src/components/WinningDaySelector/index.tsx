import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useContext } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { FIRST_RAFFLE_DAY, getRaffleDate, LAST_RAFFLE_DAY } from '../../utils/raffleDate';

interface Props {
    changeHandler?: (selected: number) => void;
    selectedDay?: number;
    label: string;
}

export const WinningDaySelector = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);

    const handleChange = (value: string) => {
        if (props.changeHandler) {
            const selectedNumber = parseInt(value, 10);
            props.changeHandler(selectedNumber);
        }
    };

    const getListOfDays = () => {
        const menuEntries = [];
        const translationFormat = localizationContext.translate('dashboard.date_format_dropdown');
        // Determine locale based on browser language (German or English)
        const locale = window.navigator.language.startsWith('de') ? de : undefined;
        for (let day = FIRST_RAFFLE_DAY; day <= LAST_RAFFLE_DAY; day++) {
            menuEntries.push(
                <SelectItem key={`menu-item-${day}`} value={day.toString()}>
                    {format(getRaffleDate(day), translationFormat, { locale })}
                </SelectItem>
            );
        }
        return menuEntries;
    };

    return (
        <div className="w-full space-y-2">
            <Label htmlFor="winning-day-select">{props.label}</Label>
            <Select value={props.selectedDay ? props.selectedDay.toString() : '1'} onValueChange={handleChange}>
                <SelectTrigger id="winning-day-select" className="w-full">
                    <SelectValue placeholder={props.label} />
                </SelectTrigger>
                <SelectContent>{getListOfDays()}</SelectContent>
            </Select>
        </div>
    );
};
