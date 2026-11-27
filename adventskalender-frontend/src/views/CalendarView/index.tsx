import { useEffect, useRef, useState } from 'react';
import { ApiAuthExpiredError, apiFetch, MAX_WINNERS_PER_DAY } from '../../api';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router';
import { WinnerCard } from '../../components/WinnerCard';
import { LocalizedText } from '../../components/LocalizedText';
import { WinnersOnDateMapSchema } from '../../schemas';

export const CalendarView = () => {
    const [allWinners, setAllWinners] = useState<WinnersOnDateMap | null>(null);
    const [hasLoadError, setHasLoadError] = useState<boolean>(false);
    const auth = useAuthentication();
    const navigate = useNavigate();
    const winnersRequestIdRef = useRef<number>(0);

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const getWinnersForAllDays = () => {
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        // each request gets an ID so that a late response of an outdated request cannot overwrite the current winners
        const requestId = ++winnersRequestIdRef.current;
        apiFetch('/participants/won', WinnersOnDateMapSchema)
            .then((winners) => {
                if (requestId !== winnersRequestIdRef.current) {
                    return;
                }
                setAllWinners(winners);
                setHasLoadError(false);
            })
            .catch((error: unknown) => {
                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (error instanceof ApiAuthExpiredError) {
                    logoutUser();
                    return;
                }
                if (requestId !== winnersRequestIdRef.current) {
                    return;
                }
                setHasLoadError(true);
            });
    };

    useEffect(() => {
        getWinnersForAllDays();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadError = (
        <p role="alert" className="text-center text-destructive">
            <LocalizedText translationKey={'calendar.load_error'} />
        </p>
    );

    if (allWinners === null) {
        if (hasLoadError) {
            return loadError;
        }
        return (
            <p role="status" className="text-center text-muted-foreground">
                <LocalizedText translationKey={'calendar.loading'} />
            </p>
        );
    }

    const sortedDates = Object.keys(allWinners).sort();

    return (
        <>
            {hasLoadError && loadError}
            {sortedDates.length === 0 ? (
                <p className="text-center text-muted-foreground">
                    <LocalizedText translationKey={'calendar.empty'} />
                </p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr [&>*]:min-w-[320px]">
                    {sortedDates.map((winningDate) => (
                        <WinnerCard
                            key={`winner-card-${winningDate}`}
                            numberOfMaxSubPackages={MAX_WINNERS_PER_DAY}
                            winningDate={winningDate}
                            listOfWinner={allWinners[winningDate].map((winnerEntry) => ({
                                id: winnerEntry.id,
                                firstName: winnerEntry.first_name,
                                lastName: winnerEntry.last_name,
                                presentIdentifier: winnerEntry.present_identifier,
                            }))}
                            updateWinnerList={getWinnersForAllDays}
                        />
                    ))}
                </div>
            )}
        </>
    );
};
