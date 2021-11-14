import Grid from '@mui/material/Grid';
import { useEffect, useState } from 'react';
import { API_BACKEND_URL } from '../../api';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { Typography } from '@mui/material';

interface SingleWinnerInformation {
    first_name: string;
    last_name: string;
}
type Foo = { [key: string]: SingleWinnerInformation[] };

export const Calendar = () => {
    const [allWinners, setAllWinners] = useState<Foo | null>(null);
    const auth = useAuthentication();
    const navigate = useNavigate();

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const getWinnersForAllDays = () => {
        // if we do not have a access token, skip fetching the infos
        if (auth.token.accessToken.length === 0) {
            return;
        }

        // since we have a token, we can query the backend for the winner count for the selected day
        fetch(`${API_BACKEND_URL}/participants/won`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${auth.token.accessToken}`,
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
                    logoutUser();
                    return Promise.reject();
                }

                // there should never be other status codes which have to be handled, but just in case, we'll handle
                // them here too
                // TODO: this
            })
            .then((parsedJson: Foo) => {
                setAllWinners(parsedJson);
            })
            .catch(() => {
                /* we do not have to anything here */
            });
    };

    useEffect(() => {
        getWinnersForAllDays();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getWinnerCardsForAllDays = () => {
        // if there are not winners in our array, return an element which indicates that there are no
        // winners so far
        if (!allWinners) {
            // TODO: check the sice also
            return <div>No Winners!</div>;
        }

        // since it seems that we have already winners, create corresponding UI elements and return them
        // to be rendered for the user
        const elements = [];
        for (const dateString in allWinners) {
            const currentWinningDay = allWinners[dateString];
            const winnersForTheDay = [];
            for (const currentWinnerIdx in currentWinningDay) {
                winnersForTheDay.push(
                    <li>
                        <Typography variant={'body1'} component={'div'}>
                            {currentWinningDay[currentWinnerIdx].first_name} {currentWinningDay[currentWinnerIdx].last_name}
                        </Typography>
                    </li>
                );
            }
            elements.push(
                <ul>
                    <li>{dateString}</li>
                    {winnersForTheDay}
                </ul>
            );
        }
        return elements;
    };

    return (
        <>
            <Grid item xs={2}>
                {getWinnerCardsForAllDays()}
            </Grid>
        </>
    );
};
