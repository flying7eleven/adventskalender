import React, { useState, useEffect } from 'react';
import { ParticipantCount, API_BACKEND_URL } from '../../api';
import { OutlinedCard } from '../../components/OutlinedCard';

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
            <OutlinedCard headline={'Overall participants'} value={`${participantCount.number_of_participants}`} description={'people are in the raffle'} />
            <OutlinedCard headline={'Participants who won'} value={`${participantCount.number_of_participants_won}`} description={'people already won in the raffle'} />
            <OutlinedCard headline={'Participants still eligible'} value={`${participantCount.number_of_participants_still_in_raffle}`} description={'people are still able to win'} />
        </>
    );
};
