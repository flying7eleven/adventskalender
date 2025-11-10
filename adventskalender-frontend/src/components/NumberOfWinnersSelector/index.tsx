import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface Props {
    changeHandler?: (selected: number) => void;
    value: number;
    label: string;
}

export const NumberOfWinnersSelector = (props: Props) => {
    const handleChange = (value: string) => {
        if (props.changeHandler) {
            const selectedNumber = parseInt(value, 10);
            props.changeHandler(selectedNumber);
        }
    };

    const getListOfWinners = () => {
        const menuEntries = [];
        for (let i = 1; i <= 10; i++) {
            menuEntries.push(
                <SelectItem key={`day-selection-menu-item-${i}`} value={i.toString()}>
                    {i}
                </SelectItem>
            );
        }
        return menuEntries;
    };

    return (
        <div className="w-full space-y-2">
            <Label htmlFor="number-of-winners-select">{props.label}</Label>
            <Select value={props.value.toString()} onValueChange={handleChange}>
                <SelectTrigger id="number-of-winners-select" className="w-full">
                    <SelectValue placeholder={props.label} />
                </SelectTrigger>
                <SelectContent>
                    {getListOfWinners()}
                </SelectContent>
            </Select>
        </div>
    );
};
