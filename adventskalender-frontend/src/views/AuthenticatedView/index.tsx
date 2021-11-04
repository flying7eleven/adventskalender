import React, { useState, useEffect } from 'react';
import { ParticipantCount, API_BACKEND_URL, Participant } from '../../api';
import { OutlinedCard } from '../../components/OutlinedCard';
import { TopControlBar } from '../../components/TopControlBar';
import Grid from '@mui/material/Grid';
import { useToken } from '../../hooks/useToken';
import LoadingButton from '@mui/lab/LoadingButton';

export const AuthenticatedView = () => {
    const [participantCount, setParticipantCount] = useState<ParticipantCount>({ number_of_participants: 0, number_of_participants_won: 0, number_of_participants_still_in_raffle: 0 });
    const [loadingNewWinner, setLoadingNewWinner] = useState(false);
    const { invalidateToken, token } = useToken();

    useEffect(() => {
        fetch(`${API_BACKEND_URL}/participants/count`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => res.json())
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
                console.log(parsedJson);
                setLoadingNewWinner(false);
            });
    };

    return (
        <>
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
