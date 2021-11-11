import LoadingButton from '@mui/lab/LoadingButton';
import React from 'react';

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
