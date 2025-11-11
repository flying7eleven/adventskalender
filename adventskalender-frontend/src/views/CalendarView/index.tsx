import { useEffect, useState } from 'react';
import { API_BACKEND_URL, MAX_WINNERS_PER_DAY } from '../../api';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { WinnerCard } from '../../components/WinnerCard';
import { WinnersOnDateMapSchema } from '../../schemas';

export const CalendarView = () => {
    const [allWinners, setAllWinners] = useState<WinnersOnDateMap | null>(null);
    const auth = useAuthentication();
    const navigate = useNavigate();

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const getWinnersForAllDays = () => {
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        // since we have a token, we can query the backend for the winner count for the selected day
        fetch(`${API_BACKEND_URL}/participants/won`, {
            method: 'GET',
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
            credentials: 'include',
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
            .then((data) => {
                // Validate the response data using Zod schema
                const validated = WinnersOnDateMapSchema.parse(data);
                setAllWinners(validated);
            })
            .catch((error) => {
                // Log validation errors for debugging
                if (error?.name === 'ZodError') {
                    console.error('API response validation failed:', error);
                }
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
                <WinnerCard
                    key={`winner-card-${sortedKeys[i]}`}
                    numberOfMaxSubPackages={MAX_WINNERS_PER_DAY}
                    winningDate={sortedKeys[i]}
                    listOfWinner={winnersForDay}
                    updateWinnerList={getWinnersForAllDays}
                />
            );
        }
        return elements;
    };

    return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr [&>*]:min-w-[320px]">{getWinnerCardsForAllDays()}</div>;
};
