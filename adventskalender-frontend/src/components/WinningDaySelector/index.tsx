import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import React, { ReactNode } from 'react';

interface Props {
    changeHandler?: (selected: number) => void;
    selectedDay?: number;
    label: string;
}

export const WinningDaySelector = (props: Props) => {
    const handleChange = (firedEvent: SelectChangeEvent, _: ReactNode) => {
        if (props.changeHandler) {
            const selectedNumber = parseInt(firedEvent.target.value);
            props.changeHandler(selectedNumber);
        }
    };

    const getListOfDays = () => {
        let menuEntries = [];
        for (let i = 1; i < 25; i++) {
            menuEntries.push(
                <MenuItem key={`menu-item-${i}`} value={i}>
                    {i}
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
