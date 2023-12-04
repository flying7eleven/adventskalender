import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { ReactNode, useContext } from 'react';
import { LocalizationContext } from '../../provider/LocalizationProvider';
import moment from 'moment';

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
        moment.locale(window.navigator.language);
        let currentDate = moment([new Date().getFullYear(), 11, 1]);
        for (let i = 1; i < 25; i++) {
            menuEntries.push(
                <MenuItem key={`menu-item-${i}`} value={i}>
                    {currentDate.format(translationFormat)}
                </MenuItem>
            );
            currentDate.add(1, 'days');
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
