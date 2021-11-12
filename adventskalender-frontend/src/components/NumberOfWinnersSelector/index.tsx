import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { ReactNode } from 'react';

interface Props {
    changeHandler?: (selected: number) => void;
    value: number;
    label: string;
}

export const NumberOfWinnersSelector = (props: Props) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleChange = (firedEvent: SelectChangeEvent, _: ReactNode) => {
        if (props.changeHandler) {
            const selectedNumber = parseInt(firedEvent.target.value, 10);
            props.changeHandler(selectedNumber);
        }
    };

    const getListOfWinners = () => {
        const menuEntries = [];
        for (let i = 1; i <= 10; i++) {
            menuEntries.push(
                <MenuItem key={`day-selection-menu-item-${i}`} value={i}>
                    {i}
                </MenuItem>
            );
        }
        return menuEntries;
    };

    return (
        <FormControl fullWidth>
            <InputLabel id="number-of-winners-select-label">{props.label}</InputLabel>
            <Select labelId="number-of-winners-select-label" id="number-of-winners-select" value={props.value.toString()} label={props.label} onChange={handleChange}>
                {getListOfWinners()}
            </Select>
        </FormControl>
    );
};
