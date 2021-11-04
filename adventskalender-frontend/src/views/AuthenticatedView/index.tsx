import React, { useState, useEffect } from 'react';
import { ParticipantCount, API_BACKEND_URL, Participant } from '../../api';
import { OutlinedCard } from '../../components/OutlinedCard';
import { TopControlBar } from '../../components/TopControlBar';
import Grid from '@mui/material/Grid';
import { useToken } from '../../hooks/useToken';
import LoadingButton from '@mui/lab/LoadingButton';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

export const AuthenticatedView = () => {
    const [participantCount, setParticipantCount] = useState<ParticipantCount>({ number_of_participants: 0, number_of_participants_won: 0, number_of_participants_still_in_raffle: 0 });
    const [loadingNewWinner, setLoadingNewWinner] = useState(false);
    const { invalidateToken, token } = useToken();
    const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);

    const handleErrorDialogClose = () => {
        setIsErrorDialogOpen(false);
    };

    useEffect(() => {
        fetch(`${API_BACKEND_URL}/participants/count`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => {
                // if we got a valid response from the backend, it should be JSON. We can convert it to a valid JSON
                // object and proceed processing it
                if (res.status === 200) {
                    return res.json();
                }

                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (res.status === 401 || res.status === 403) {
                    invalidateToken();
                    return;
                }

                // there should never be other status codes which have to be handled, but just in case, we'll handle
                // them here too
                // TODO: this
            })
            .then((parsedJson) => {
                setParticipantCount(parsedJson);
            });
    }, [token.accessToken]);

    const pickNewWinner = () => {
        setLoadingNewWinner(true);
        fetch(`${API_BACKEND_URL}/participants/pick`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => res.json())
            .then((parsedJson: Participant) => {
                // the winner was selected and has to be set to have one before showing it to the user
                fetch(`${API_BACKEND_URL}/participants/won/${parsedJson.id}`, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token.accessToken}`,
                        'Content-type': 'application/json; charset=UTF-8',
                    },
                })
                    .then(() => {
                        // TODO: show it to the user
                        setLoadingNewWinner(false);
                    })
                    .catch((error) => {
                        setIsErrorDialogOpen(true);
                        setLoadingNewWinner(false);
                    });
            })
            .catch((error) => {
                setIsErrorDialogOpen(true);
                setLoadingNewWinner(false);
            });
    };

    return (
        <>
            <Dialog open={isErrorDialogOpen} onClose={handleErrorDialogClose} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
                <DialogTitle id="alert-dialog-title">Error on picking a new winner</DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description">We could not pick a new winner. Maybe we are out of participant who did not win so far?</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleErrorDialogClose} autoFocus>
                        Ok
                    </Button>
                </DialogActions>
            </Dialog>
            <Grid container columns={12} spacing={2}>
                <Grid item xs={12}>
                    <TopControlBar title={'Adventskalender'} actionTitle={'Logout'} actionHandler={invalidateToken} />
                </Grid>
                <Grid item>
                    <OutlinedCard headline={'Overall participants'} value={`${participantCount.number_of_participants}`} description={'people are in the raffle'} />
                </Grid>
                <Grid item>
                    <OutlinedCard headline={'Participants who won'} value={`${participantCount.number_of_participants_won}`} description={'people already won in the raffle'} />
                </Grid>
                <Grid item>
                    <OutlinedCard headline={'Participants still eligible'} value={`${participantCount.number_of_participants_still_in_raffle}`} description={'people are still able to win'} />
                </Grid>
                <Grid item xs={12}>
                    <LoadingButton variant="contained" loading={loadingNewWinner} onClick={pickNewWinner}>
                        Pick new winner
                    </LoadingButton>
                </Grid>
            </Grid>
        </>
    );
};
