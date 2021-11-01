import React, { useState, useEffect } from 'react';
import { ParticipantCount, API_BACKEND_URL } from '../../api';

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
        <div>
            <div>{participantCount.number_of_participants_still_in_raffle}</div>
            <div>{participantCount.number_of_participants}</div>
            <div>{participantCount.number_of_participants_won}</div>
        </div>
    );
};
