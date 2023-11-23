import LoadingButton from '@mui/lab/LoadingButton';

interface Props {
    onRequestWinner: () => void;
    isLoadingNewWinner: boolean;
    label: string;
    isEnabled: boolean;
}

export const PickNewWinner = (props: Props) => {
    return (
        <LoadingButton disabled={!props.isEnabled} variant="contained" loading={props.isLoadingNewWinner} onClick={props.onRequestWinner}>
            {props.label}
        </LoadingButton>
    );
};
