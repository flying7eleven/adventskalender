import LoadingButton from '@mui/lab/LoadingButton';

interface Props {
    onRequestWinner: () => void;
    isLoadingNewWinner: boolean;
    label: string;
}

export const PickNewWinner = (props: Props) => {
    return (
        <LoadingButton variant="contained" loading={props.isLoadingNewWinner} onClick={props.onRequestWinner}>
            {props.label}
        </LoadingButton>
    );
};
