import Grid from '@mui/material/Grid';
import { OutlinedCard } from '../../components/OutlinedCard';
import { Stack } from '@mui/material';
import { WinningDaySelector } from '../../components/WinningDaySelector';
import { PickNewWinner } from '../../components/PickNewWinner';
import { API_BACKEND_URL, MAX_WINNERS_PER_DAY, Participant, ParticipantCount, WinnerInformation } from '../../api';
import { useContext, useEffect, useState } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { WinnerDialog } from '../../dialogs/WinnerDialog';
import { UnknownErrorDialog } from '../../dialogs/UnknownErrorDialog';
import { NoParticipantsErrorDialog } from '../../dialogs/NoParticipantsErrorDialog';

export const DashboardView = () => {
    const [participantCount, setParticipantCount] = useState<ParticipantCount>({ number_of_participants: 0, number_of_participants_won: 0, number_of_participants_still_in_raffle: 0 });
    const [loadingNewWinner, setLoadingNewWinner] = useState<boolean>(false);
    const [isLastWinnerDialogOpen, setIsLastWinnerDialogOpen] = useState<boolean>(false);
    const localizationContext = useContext(LocalizationContext);
    const [winnersOnSelectedDay, setWinnersOnSelectedDay] = useState<number>(0);
    const auth = useAuthentication();
    const navigate = useNavigate();
    const [selectedDay, setSelectedDay] = useState<number>(() => {
        const today = new Date().getUTCDate();
        if (today < 1) {
            return 1;
        } else if (today > 24) {
            return 24;
        }
        return today;
    });
    const [lastWinners, setLastWinners] = useState<WinnerInformation[]>([]);
    const [isUnknownErrorDialogOpen, setIsUnknownErrorDialogOpen] = useState(false);
    const [isNoParticipantsErrorDialogOpen, setIsNoParticipantsErrorDialogOpen] = useState(false);

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const handleDateSelectionChange = (newDay: number) => {
        setSelectedDay(newDay);
    };

    const handleWinnerDialogVisibilityChange = (shouldBeOpen: boolean) => {
        updateWinnerCounter();
        updateParticipantCounters();
        setIsLastWinnerDialogOpen(shouldBeOpen);
    };

    const updateWinnerCounter = () => {
        // if we do not have a access token, skip fetching the infos
        if (auth.token.accessToken.length === 0) {
            return;
        }

        // since we have a token, we can query the backend for the winner count for the selected day
        fetch(`${API_BACKEND_URL}/participants/won/${getSelectedDateAsString()}/count`, {
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
            .then((parsedJson: number) => {
                setWinnersOnSelectedDay(parsedJson);
            })
            .catch(() => {
                /* we do not have to anything here */
            });
    };

    const updateParticipantCounters = () => {
        // if we do not have an access token, skip fetching the infos
        if (auth.token.accessToken.length === 0) {
            return;
        }

        // since we have a token, we can query the backend for the participant count
        fetch(`${API_BACKEND_URL}/participants/count`, {
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
            .then((parsedJson: ParticipantCount) => {
                setParticipantCount(parsedJson);
            })
            .catch(() => {
                /* we do not have to anything here */
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

    const getSelectedDateAsString = () => `${new Date().getFullYear()}-12-${selectedDay}`;

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
            return;
        }

        // try to pick a new winner from the backend
        fetch(`${API_BACKEND_URL}/participants/pick/${winnersStillToPick}/for/${getSelectedDateAsString()}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${auth.token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => {
                // if the call was successful, we expect to have received a valid JSON object. Convert it to an object
                // and return it for further processing
                if (res.status === 200) {
                    return res.json();
                }

                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (res.status === 401 || res.status === 403) {
                    logoutUser();
                    return Promise.reject();
                }

                // if the status was 404, we do not have any participants left in the raffle which can be picked. Show
                // a dialog to the user which indicates that
                if (res.status === 404) {
                    setIsNoParticipantsErrorDialogOpen(true);
                    setLoadingNewWinner(false);
                    return Promise.reject();
                }

                // in all other cases, we expect that there was an unknown error. We indicate that to the user by showing
                // a proper error dialog
                setIsUnknownErrorDialogOpen(true);
                setLoadingNewWinner(false);
                return Promise.reject();
            })
            .then((parsedJson: Participant[]) => {
                // setup the dialog for the picked winners and return ensure the dialog is shown to the user, ...
                const mappedWinners = parsedJson.map((element) => {
                    return { id: element.id, firstName: element.first_name, lastName: element.last_name, presentIdentifier: element.present_identifier };
                });
                setLastWinners(mappedWinners);
                setIsLastWinnerDialogOpen(true);

                // ... re-enable the button, so the user can select another winner
                setLoadingNewWinner(false);

                // the last step is to ensure the counters will get updated
                updateParticipantCounters();
                updateWinnerCounter();
            })
            .catch(() => {
                /* we do not have to anything here */
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
            <Grid container columns={12} spacing={2} justifyContent={'center'} alignItems={'center'}>
                <Grid item>
                    <OutlinedCard
                        headline={localizationContext.translate('dashboard.cards.total.title')}
                        value={`${participantCount.number_of_participants}`}
                        description={localizationContext.translate('dashboard.cards.total.description')}
                    />
                </Grid>
                <Grid item>
                    <OutlinedCard
                        headline={localizationContext.translate('dashboard.cards.won.title')}
                        value={`${participantCount.number_of_participants_won}`}
                        description={localizationContext.translate('dashboard.cards.won.description')}
                    />
                </Grid>
                <Grid item>
                    <OutlinedCard
                        headline={localizationContext.translate('dashboard.cards.eligible.title')}
                        value={`${participantCount.number_of_participants_still_in_raffle}`}
                        description={localizationContext.translate('dashboard.cards.eligible.description')}
                    />
                </Grid>
            </Grid>
            <Grid container columns={12} spacing={2} justifyContent={'center'} alignItems={'center'} sx={{ marginTop: '16px', marginBottom: '16px' }}>
                <Grid item>
                    <OutlinedCard
                        headline={localizationContext.translate('dashboard.cards.pick_new_winner.title')}
                        value={
                            <Stack spacing={2} sx={{ marginTop: '16px', marginBottom: '16px' }}>
                                <WinningDaySelector label={localizationContext.translate('dashboard.day_selection')} selectedDay={selectedDay} changeHandler={handleDateSelectionChange} />
                                <PickNewWinner
                                    isEnabled={getNumberOfWinnersToPick(winnersOnSelectedDay) > 0}
                                    isLoadingNewWinner={loadingNewWinner}
                                    onRequestWinner={checkPicking}
                                    label={localizationContext.translate('dashboard.pick_winner_button')}
                                />
                            </Stack>
                        }
                        description={localizationContext.translateWithPlaceholder('dashboard.cards.pick_new_winner.description', winnersOnSelectedDay.toString())}
                    />
                </Grid>
            </Grid>
        </>
    );
};
