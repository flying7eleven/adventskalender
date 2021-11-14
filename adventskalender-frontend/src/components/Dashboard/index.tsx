import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import { Localized } from '../Localized';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import { OutlinedCard } from '../OutlinedCard';
import { Stack } from '@mui/material';
import { NumberOfWinnersSelector } from '../NumberOfWinnersSelector';
import { WinningDaySelector } from '../WinningDaySelector';
import { PickNewWinner } from '../PickNewWinner';
import { API_BACKEND_URL, Participant, ParticipantCount } from '../../api';
import { useContext, useEffect, useState } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { LocalizationContext } from '../LocalizationProvider';

export const Dashboard = () => {
    const [participantCount, setParticipantCount] = useState<ParticipantCount>({ number_of_participants: 0, number_of_participants_won: 0, number_of_participants_still_in_raffle: 0 });
    const [loadingNewWinner, setLoadingNewWinner] = useState<boolean>(false);
    const localizationContext = useContext(LocalizationContext);
    const [winnersOnSelectedDay, setWinnersOnSelectedDay] = useState<number>(0);
    const auth = useAuthentication();
    const navigate = useNavigate();
    const [numberOfWinners, setNumberOfWinners] = useState<number>(6);
    const [selectedDay, setSelectedDay] = useState<number>(() => {
        const today = new Date().getUTCDate();
        if (today < 1 || today > 24) {
            return 1;
        }
        return today;
    });
    const [lastWinners, setLastWinners] = useState<WinnerInformation[]>([]);
    const [isUnknownErrorDialogOpen, setIsUnknownErrorDialogOpen] = useState(false);
    const [isLastWinnerDialogOpen, setIsLastWinnerDialogOpen] = useState(false);
    const [isNoParticipantsErrorDialogOpen, setIsNoParticipantsErrorDialogOpen] = useState(false);

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const handleDateSelectionChange = (newDay: number) => {
        setSelectedDay(newDay);
    };

    const handleNumberOfWinnersSelectionChange = (newNumberOfWinners: number) => {
        setNumberOfWinners(newNumberOfWinners);
    };

    const handleUnknownErrorDialogClose = () => {
        setIsUnknownErrorDialogOpen(false);
    };

    const handleLastWinnerDialogClose = () => {
        setIsLastWinnerDialogOpen(false);
    };

    const handleNoParticipantsErrorDialogOpenClose = () => {
        setIsNoParticipantsErrorDialogOpen(false);
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
        // if we do not have a access token, skip fetching the infos
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

    const pickMultipleNewWinner = () => {
        // first we have to set the button into a loading state, so the user cannot fetch another winner until we are
        // done processing the first request
        setLoadingNewWinner(true);

        // try to pick a new winner from the backend
        fetch(`${API_BACKEND_URL}/participants/pick/${numberOfWinners}/for/${getSelectedDateAsString()}`, {
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
                    return { firstName: element.first_name, lastName: element.last_name };
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

    const getTextForWinnersDialog = () => {
        const elementsToReturn = [];
        for (const currentUser in lastWinners) {
            elementsToReturn.push(
                <li>
                    {lastWinners[currentUser].firstName} {lastWinners[currentUser].lastName}
                </li>
            );
        }
        return elementsToReturn;
    };

    return (
        <>
            <Dialog open={isLastWinnerDialogOpen} onClose={handleLastWinnerDialogClose} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
                <DialogTitle id="alert-dialog-title">
                    <Localized translationKey={'dashboard.dialogs.new_winners.title'} />
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description">
                        <Localized translationKey={'dashboard.dialogs.new_winners.text'} />
                        <ul>{getTextForWinnersDialog()}</ul>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleLastWinnerDialogClose} autoFocus>
                        <Localized translationKey={'dashboard.dialogs.new_winners.accept_button'} />
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog open={isUnknownErrorDialogOpen} onClose={handleUnknownErrorDialogClose} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
                <DialogTitle id="alert-dialog-title">
                    <Localized translationKey={'dashboard.dialogs.unknown_error.title'} />
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description">
                        <Localized translationKey={'dashboard.dialogs.unknown_error.text'} />
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleUnknownErrorDialogClose} autoFocus>
                        <Localized translationKey={'dashboard.dialogs.unknown_error.accept_button'} />
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog open={isNoParticipantsErrorDialogOpen} onClose={handleNoParticipantsErrorDialogOpenClose} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
                <DialogTitle id="alert-dialog-title">
                    <Localized translationKey={'dashboard.dialogs.no_participants_left.title'} />
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description">
                        <Localized translationKey={'dashboard.dialogs.no_participants_left.text'} />
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleNoParticipantsErrorDialogOpenClose} autoFocus>
                        <Localized translationKey={'dashboard.dialogs.no_participants_left.accept_button'} />
                    </Button>
                </DialogActions>
            </Dialog>
            <Grid item xs={2}>
                <OutlinedCard
                    headline={localizationContext.translate('dashboard.cards.total.title')}
                    value={`${participantCount.number_of_participants}`}
                    description={localizationContext.translate('dashboard.cards.total.description')}
                />
            </Grid>
            <Grid item xs={2}>
                <OutlinedCard
                    headline={localizationContext.translate('dashboard.cards.won.title')}
                    value={`${participantCount.number_of_participants_won}`}
                    description={localizationContext.translate('dashboard.cards.won.description')}
                />
            </Grid>
            <Grid item xs={2}>
                <OutlinedCard
                    headline={localizationContext.translate('dashboard.cards.eligible.title')}
                    value={`${participantCount.number_of_participants_still_in_raffle}`}
                    description={localizationContext.translate('dashboard.cards.eligible.description')}
                />
            </Grid>
            <br />
            <Grid container columns={12} spacing={2} justifyContent={'center'} alignItems={'center'}>
                <Grid item>
                    <OutlinedCard
                        headline={localizationContext.translate('dashboard.cards.pick_new_winner.title')}
                        value={
                            <Stack spacing={2}>
                                <br />
                                <NumberOfWinnersSelector
                                    label={localizationContext.translate('dashboard.number_of_winners')}
                                    value={numberOfWinners}
                                    changeHandler={handleNumberOfWinnersSelectionChange}
                                />
                                <WinningDaySelector label={localizationContext.translate('dashboard.day_selection')} selectedDay={selectedDay} changeHandler={handleDateSelectionChange} />
                                <PickNewWinner isLoadingNewWinner={loadingNewWinner} onRequestWinner={pickMultipleNewWinner} label={localizationContext.translate('dashboard.pick_winner_button')} />
                                <br />
                            </Stack>
                        }
                        description={localizationContext.translateWithPlaceholder('dashboard.cards.pick_new_winner.description', winnersOnSelectedDay.toString())}
                    />
                </Grid>
            </Grid>
        </>
    );
};
