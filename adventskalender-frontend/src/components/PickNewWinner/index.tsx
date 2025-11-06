import Button from '@mui/material/Button';

interface Props {
    onRequestWinner: () => void;
    isLoadingNewWinner: boolean;
    label: string;
    isEnabled: boolean;
}

export const PickNewWinner = (props: Props) => {
    return (
        <Button disabled={!props.isEnabled} variant="contained" loading={props.isLoadingNewWinner} onClick={props.onRequestWinner}>
            {props.label}
        </Button>
    );
};
