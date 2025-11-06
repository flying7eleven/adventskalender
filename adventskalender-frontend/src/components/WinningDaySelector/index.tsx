import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { ReactNode, useContext } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';

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

    const getListOfDays = () => {
        const menuEntries = [];
        const translationFormat = localizationContext.translate('dashboard.date_format_dropdown');
        // Determine locale based on browser language (German or English)
        const locale = window.navigator.language.startsWith('de') ? de : undefined;
        let currentDate = new Date(new Date().getFullYear(), 11, 1); // December 1st
        for (let i = 1; i < 25; i++) {
            menuEntries.push(
                <MenuItem key={`menu-item-${i}`} value={i}>
                    {format(currentDate, translationFormat, { locale })}
                </MenuItem>
            );
            currentDate = addDays(currentDate, 1);
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
