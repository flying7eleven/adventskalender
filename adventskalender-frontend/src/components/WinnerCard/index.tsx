import { LocalizedText } from '../LocalizedText';
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, Stack, Typography } from '@mui/material';
import { API_BACKEND_URL, WinnerInformation } from '../../api';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface Props {
    winningDate: string;
    listOfWinner: WinnerInformation[];
    updateWinnerList?: () => void;
}

const PersonItem = ({ winner, winningDay, updateWinnerList }: { winner: WinnerInformation; winningDay: number; updateWinnerList?: () => void }) => {
    const auth = useAuthentication();
    const navigate = useNavigate();
    const [dialogOpen, setDialogOpen] = useState<boolean>(false);
    const [userToDelete, setUserToDelete] = useState<WinnerInformation | undefined>(undefined);

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const getShortenedName = (inputName: string) => {
        const splittedName = inputName.split(' ');
        if (splittedName.length > 2) {
            return `${splittedName[0]} ${splittedName[1][0]}. ${splittedName[splittedName.length - 1]}`;
        }
        return inputName;
    };

    const handleRemoveParticipant = () => {
        // if we do not have an access token, skip fetching the infos
        if (auth.token.accessToken.length === 0) {
            return;
        }

        // since we have a token, we can query the backend for the winner count for the selected day
        fetch(`${API_BACKEND_URL}/participants/won/${userToDelete?.id}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${auth.token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((res) => {
                // if we got a valid response from the backend, it should be JSON. We can convert it to a valid JSON
                // object and proceed processing it
                if (res.status === 204) {
                    return;
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
            .then(() => {
                if (updateWinnerList) {
                    updateWinnerList();
                }
                setDialogOpen(false);
            })
            .catch(() => {
                // TODO: handle errors
            });
    };

    const handleDeleteClick = (user: WinnerInformation) => {
        return () => {
            setUserToDelete(user);
            setDialogOpen(true);
        };
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
    };

    return (
        <>
            <Dialog open={dialogOpen} onClose={handleCloseDialog} aria-labelledby="alert-dialog-remove-participant-title" aria-describedby="alert-dialog-remove-participant-description">
                <DialogTitle id="alert-dialog-remove-participant-title">
                    <LocalizedText translationKey={'calendar.dialogs.remove_participant.title'} />
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-remove-participant-description">
                        <Stack>
                            <LocalizedText translationKey={'calendar.dialogs.remove_participant.text'} />
                            <ul>
                                <li>{`${userToDelete?.firstName} ${userToDelete?.lastName}`}</li>
                            </ul>
                        </Stack>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleRemoveParticipant}>
                        <LocalizedText translationKey={'calendar.dialogs.remove_participant.accept_button'} />
                    </Button>
                    <Button onClick={handleCloseDialog} autoFocus>
                        <LocalizedText translationKey={'calendar.dialogs.remove_participant.cancel_button'} />
                    </Button>
                </DialogActions>
            </Dialog>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div style={{ display: 'flex' }}>
                    <Typography sx={{ textAlign: 'left' }}>{getShortenedName(`${winner.firstName} ${winner.lastName}`)}</Typography>
                    &nbsp;
                    <Typography sx={{ fontWeight: 'bold' }}>{`${winningDay}${winner.presentIdentifier ? winner.presentIdentifier : ''}`}</Typography>
                </div>
                <Button variant={'outlined'} sx={{ borderRadius: '20px', fontSize: 'x-small', textAlign: 'right' }} onClick={handleDeleteClick(winner)}>
                    <LocalizedText translationKey={'calendar.cards.winners.button_remove'} />
                </Button>
            </Box>
        </>
    );
};

export const WinnerCard = (props: Props) => {
    const getWinningEntries = () => {
        const elements = [];
        const sortedWinners = props.listOfWinner.sort((winnerA, winnerB) => {
            return winnerA.lastName.localeCompare(winnerB.lastName);
        });
        const winningDayFromDate = Number.parseInt(props.winningDate.substring(8)); // TODO: ugly, we should parse the date here instead
        for (let i = 0; i < sortedWinners.length; i++) {
            elements.push(<PersonItem key={`person-item-${sortedWinners[i].id}`} winner={sortedWinners[i]} winningDay={winningDayFromDate} updateWinnerList={props.updateWinnerList} />);
            if (i !== sortedWinners.length - 1) {
                elements.push(<Divider key={`divider-${sortedWinners[i].id}`} variant={'middle'} />);
            }
        }
        return elements;
    };

    const getFormattedDate = (inputDate: string) => {
        const dateRegex = /(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})/g;
        const matchedString = dateRegex.exec(inputDate);
        if (matchedString) {
            return `${matchedString.groups?.['day']}.${matchedString.groups?.['month']}.${matchedString.groups?.['year']}`;
        }
        return inputDate;
    };

    return (
        <>
            <Card variant="outlined">
                <CardContent>
                    <Stack direction={'column'} spacing={1}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr' }}>
                            <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                <LocalizedText translationKey={'calendar.cards.winners.headline'} />
                            </Typography>
                            <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'right' }}>
                                {getFormattedDate(props.winningDate)}
                            </Typography>
                        </Box>
                        {getWinningEntries()}
                    </Stack>
                </CardContent>
            </Card>
        </>
    );
};
