import React, { useState, useEffect } from 'react';
import { ParticipantCount, API_BACKEND_URL } from '../../api';
import { OutlinedCard } from '../../components/OutlinedCard';
import { TopControlBar } from '../../components/TopControlBar';
import Grid from '@mui/material/Grid';

export const AuthenticatedView = () => {
    const [participantCount, setParticipantCount] = useState<ParticipantCount>({ number_of_participants: 0, number_of_participants_won: 0, number_of_participants_still_in_raffle: 0 });

    useEffect(() => {
        fetch(`${API_BACKEND_URL}/participants/count`, { method: 'GET' })
            .then((res) => res.json())
            .then((parsedJson) => {
                setParticipantCount(parsedJson);
            });
    }, []);

    return (
        <>
            <Grid container columns={12} spacing={2}>
                <Grid item xs={12}>
                    <TopControlBar title={'Adventskalender'} actionTitle={'Logout'} actionHandler={() => {}} />
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
            </Grid>
        </>
    );
};
