import { OutlinedCard } from '../../components/OutlinedCard';
import { WinningDaySelector } from '../../components/WinningDaySelector';
import { PickNewWinner } from '../../components/PickNewWinner';
import { ApiAuthExpiredError, ApiResponseError, apiFetch, MAX_WINNERS_PER_DAY, ParticipantCount, WinnerInformation } from '../../api';
import { useContext, useEffect, useRef, useState } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { WinnerDialog } from '../../dialogs/WinnerDialog';
import { UnknownErrorDialog } from '../../dialogs/UnknownErrorDialog';
import { toast } from 'sonner';
import { NoParticipantsErrorDialog } from '../../dialogs/NoParticipantsErrorDialog';
import { CountSchema, ParticipantCountSchema, ParticipantArraySchema } from '../../schemas';
import { formatRaffleDay, getDefaultRaffleDay } from '../../utils/raffleDate';

export const DashboardView = () => {
    const [participantCount, setParticipantCount] = useState<ParticipantCount>({ number_of_participants: 0, number_of_participants_won: 0, number_of_participants_still_in_raffle: 0 });
    const [loadingNewWinner, setLoadingNewWinner] = useState<boolean>(false);
    const [isLastWinnerDialogOpen, setIsLastWinnerDialogOpen] = useState<boolean>(false);
    const localizationContext = useContext(LocalizationContext);
    const [winnersOnSelectedDay, setWinnersOnSelectedDay] = useState<number>(0);
    const auth = useAuthentication();
    const navigate = useNavigate();
    const [selectedDay, setSelectedDay] = useState<number>(getDefaultRaffleDay);
    const [lastWinners, setLastWinners] = useState<WinnerInformation[]>([]);
    const [isUnknownErrorDialogOpen, setIsUnknownErrorDialogOpen] = useState(false);
    const [isNoParticipantsErrorDialogOpen, setIsNoParticipantsErrorDialogOpen] = useState(false);

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const winnerCounterRequestIdRef = useRef<number>(0);

    const handleDateSelectionChange = (newDay: number) => {
        setSelectedDay(newDay);
    };

    const handleWinnerDialogVisibilityChange = (shouldBeOpen: boolean) => {
        updateWinnerCounter();
        updateParticipantCounters();
        setIsLastWinnerDialogOpen(shouldBeOpen);
    };

    const updateWinnerCounter = () => {
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        // since we are authenticated, we can query the backend for the winner count for the selected day. Each
        // request gets an ID so that a late response of an outdated request cannot overwrite the current value
        const requestId = ++winnerCounterRequestIdRef.current;
        apiFetch(`/participants/won/${getSelectedDateAsString()}/count`, CountSchema)
            .then((winnerCount) => {
                // a newer request was started in the meantime, so this response is stale and must not be applied
                if (requestId !== winnerCounterRequestIdRef.current) {
                    return;
                }
                setWinnersOnSelectedDay(winnerCount);
            })
            .catch((error: unknown) => {
                if (error instanceof ApiAuthExpiredError) {
                    logoutUser();
                }
            });
    };

    const updateParticipantCounters = () => {
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        // since we are authenticated, we can query the backend for the participant count
        apiFetch('/participants/count', ParticipantCountSchema)
            .then(setParticipantCount)
            .catch((error: unknown) => {
                if (error instanceof ApiAuthExpiredError) {
                    logoutUser();
                }
            });
    };

    useEffect(() => {
        updateParticipantCounters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        updateWinnerCounter();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDay]);

    const getSelectedDateAsString = () => formatRaffleDay(selectedDay);

    const getNumberOfWinnersToPick = (winnersOnThisDay: number) => {
        return MAX_WINNERS_PER_DAY - winnersOnThisDay;
    };

    const pickMultipleNewWinner = (winnersOnThisDay: number) => {
        // first we have to set the button into a loading state, so the user cannot fetch another winner until we are
        // done processing the first request
        setLoadingNewWinner(true);

        // determine the number of winners which are missing for that day
        const winnersStillToPick = getNumberOfWinnersToPick(winnersOnThisDay);
        if (winnersStillToPick <= 0) {
            setLoadingNewWinner(false);
            return;
        }

        // Don't try to pick more winners than there are eligible participants
        const actualWinnersToPick = Math.min(winnersStillToPick, participantCount.number_of_participants_still_in_raffle);
        if (actualWinnersToPick <= 0) {
            setLoadingNewWinner(false);
            return;
        }

        // try to pick a new winner from the backend
        apiFetch(`/participants/pick/${actualWinnersToPick}/for/${getSelectedDateAsString()}`, ParticipantArraySchema, { method: 'POST' })
            .then((pickedWinners) => {
                // setup the dialog for the picked winners and return ensure the dialog is shown to the user, ...
                const mappedWinners = pickedWinners.map((element) => {
                    return { id: element.id, firstName: element.first_name, lastName: element.last_name, presentIdentifier: element.present_identifier };
                });
                setLastWinners(mappedWinners);
                setIsLastWinnerDialogOpen(true);

                // the last step is to ensure the counters will get updated
                updateParticipantCounters();
                updateWinnerCounter();
            })
            .catch((error: unknown) => {
                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (error instanceof ApiAuthExpiredError) {
                    logoutUser();
                    return;
                }

                // if there are already the maximum number of winners on the day, the backend refuses to pick more
                // winners. Show a message to the user and update the winner counter to reflect the actual value
                if (error instanceof ApiResponseError && error.status === 409) {
                    toast.error(localizationContext.translate('dashboard.dialogs.max_winners_per_day'), {
                        duration: 6000,
                    });
                    updateWinnerCounter();
                    return;
                }

                // if the status was 404, we do not have any participants left in the raffle which can be picked. Show
                // a dialog to the user which indicates that
                if (error instanceof ApiResponseError && error.status === 404) {
                    setIsNoParticipantsErrorDialogOpen(true);
                    return;
                }

                // in all other cases, we expect that there was an unknown error. We indicate that to the user by showing
                // a proper error dialog
                setIsUnknownErrorDialogOpen(true);
            })
            .finally(() => {
                // re-enable the button, so the user can select another winner
                setLoadingNewWinner(false);
            });
    };

    const checkPicking = () => {
        pickMultipleNewWinner(winnersOnSelectedDay);
    };

    return (
        <>
            <WinnerDialog
                date={getSelectedDateAsString()}
                numberOfMaxSubPackages={MAX_WINNERS_PER_DAY}
                winner={lastWinners}
                isOpen={isLastWinnerDialogOpen}
                setDialogOpenStateFunction={handleWinnerDialogVisibilityChange}
            />
            <UnknownErrorDialog isOpen={isUnknownErrorDialogOpen} setDialogOpenStateFunction={setIsUnknownErrorDialogOpen} />
            <NoParticipantsErrorDialog isOpen={isNoParticipantsErrorDialogOpen} setDialogOpenStateFunction={setIsNoParticipantsErrorDialogOpen} />
            <div className="flex flex-wrap justify-center items-center gap-4">
                <OutlinedCard
                    headline={localizationContext.translate('dashboard.cards.total.title')}
                    value={`${participantCount.number_of_participants}`}
                    description={localizationContext.translate('dashboard.cards.total.description')}
                />
                <OutlinedCard
                    headline={localizationContext.translate('dashboard.cards.won.title')}
                    value={`${participantCount.number_of_participants_won}`}
                    description={localizationContext.translate('dashboard.cards.won.description')}
                />
                <OutlinedCard
                    headline={localizationContext.translate('dashboard.cards.eligible.title')}
                    value={`${participantCount.number_of_participants_still_in_raffle}`}
                    description={localizationContext.translate('dashboard.cards.eligible.description')}
                />
            </div>
            <div className="flex justify-center items-center my-4">
                <OutlinedCard
                    headline={localizationContext.translate('dashboard.cards.pick_new_winner.title')}
                    value={
                        <div className="flex flex-col gap-4 my-4">
                            <WinningDaySelector label={localizationContext.translate('dashboard.day_selection')} selectedDay={selectedDay} changeHandler={handleDateSelectionChange} />
                            <PickNewWinner
                                isEnabled={getNumberOfWinnersToPick(winnersOnSelectedDay) > 0}
                                isLoadingNewWinner={loadingNewWinner}
                                onRequestWinner={checkPicking}
                                label={localizationContext.translate('dashboard.pick_winner_button')}
                            />
                        </div>
                    }
                    description={localizationContext.translateWithPlaceholder('dashboard.cards.pick_new_winner.description', winnersOnSelectedDay.toString())}
                />
            </div>
        </>
    );
};
