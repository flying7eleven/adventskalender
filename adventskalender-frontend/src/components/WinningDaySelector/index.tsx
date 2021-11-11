import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { ReactNode, useContext } from 'react';
import { LocalizationContext } from '../LocalizationProvider';

interface Props {
    changeHandler?: (selected: number) => void;
    selectedDay?: number;
    label: string;
}

export const WinningDaySelector = (props: Props) => {
    const localizationContext = useContext(LocalizationContext);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleChange = (firedEvent: SelectChangeEvent, _: ReactNode) => {
        if (props.changeHandler) {
            const selectedNumber = parseInt(firedEvent.target.value, 10);
            props.changeHandler(selectedNumber);
        }
    };

    const getWeekDay = (day: number) => {
        const dateString = new Date(`${new Date().getFullYear()}-12-${day}`);
        switch (dateString.getDay()) {
            case 0:
                return localizationContext.translate('dashboard.weekdays.sunday_short');
            case 1:
                return localizationContext.translate('dashboard.weekdays.monday_short');
            case 2:
                return localizationContext.translate('dashboard.weekdays.tuesday_short');
            case 3:
                return localizationContext.translate('dashboard.weekdays.wednesday_short');
            case 4:
                return localizationContext.translate('dashboard.weekdays.thursday_short');
            case 5:
                return localizationContext.translate('dashboard.weekdays.friday_short');
            case 6:
                return localizationContext.translate('dashboard.weekdays.saturday_short');
            default:
                throw Error();
        }
    };

    const getListOfDays = () => {
        const menuEntries = [];
        for (let i = 1; i < 25; i++) {
            const text = `${getWeekDay(i)}, ${i}. ${localizationContext.translate('dashboard.months.december')}`;
            menuEntries.push(
                <MenuItem key={`menu-item-${i}`} value={i}>
                    {text}
                </MenuItem>
            );
        }
        return menuEntries;
    };

    return (
        <FormControl fullWidth>
            <InputLabel id="winning-day-select-label">{props.label}</InputLabel>
            <Select labelId="winning-day-select-label" id="winning-day-select" value={props.selectedDay ? props.selectedDay.toString() : '1'} label={props.label} onChange={handleChange}>
                {getListOfDays()}
            </Select>
        </FormControl>
    );
};
