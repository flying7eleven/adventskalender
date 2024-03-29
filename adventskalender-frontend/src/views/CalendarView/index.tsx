import Grid from '@mui/material/Grid';
import { useEffect, useState } from 'react';
import { API_BACKEND_URL, MAX_WINNERS_PER_DAY } from '../../api';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { WinnerCard } from '../../components/WinnerCard';

export const CalendarView = () => {
    const [allWinners, setAllWinners] = useState<WinnersOnDateMap | null>(null);
    const auth = useAuthentication();
    const navigate = useNavigate();

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const getWinnersForAllDays = () => {
        // if we do not have an access token, skip fetching the infos
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
            .then((parsedJson: WinnersOnDateMap) => {
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
            // TODO: check the size as well and not only if it is an object or undefined
            return <div>No Winners!</div>;
        }

        // since it seems that we have already winners, create corresponding UI elements and return them
        // to be rendered for the user
        const elements = [];
        const sortedKeys = Object.keys(allWinners).sort();
        for (const i in sortedKeys) {
            const winnersForDay = allWinners[sortedKeys[i]].map((winnerEntry) => {
                return {
                    id: winnerEntry.id,
                    firstName: winnerEntry.first_name,
                    lastName: winnerEntry.last_name,
                    presentIdentifier: winnerEntry.present_identifier,
                };
            });
            elements.push(
                <Grid item xs={3} key={`winner-card-grid-item-${sortedKeys[i]}`}>
                    <WinnerCard
                        key={`winner-card-${sortedKeys[i]}`}
                        numberOfMaxSubPackages={MAX_WINNERS_PER_DAY}
                        winningDate={sortedKeys[i]}
                        listOfWinner={winnersForDay}
                        updateWinnerList={getWinnersForAllDays}
                    />
                </Grid>
            );
        }
        return elements;
    };

    return (
        <Grid container columns={12} spacing={2} justifyContent={'center'} alignItems={'center'} sx={{ paddingLeft: '64px', paddingRight: '32px' }}>
            {getWinnerCardsForAllDays()}
        </Grid>
    );
};
