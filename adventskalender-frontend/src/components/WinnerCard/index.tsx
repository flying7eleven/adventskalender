import { LocalizedText } from '../LocalizedText';
import {
    Box,
    Button,
    Card,
    CardContent,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    FormHelperText,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { API_BACKEND_URL, WinnerInformation } from '../../api';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { ReactNode, useState } from 'react';
import Paper from '@mui/material/Paper';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

interface Props {
    winningDate: string;
    listOfWinner: WinnerInformation[];
    updateWinnerList?: () => void;
    numberOfMaxSubPackages: number;
}

const PersonItem = ({
    winner,
    winningDay,
    numberOfMaxSubPackages,
    updateWinnerList,
}: {
    winner: WinnerInformation;
    winningDay: number;
    numberOfMaxSubPackages: number;
    updateWinnerList?: () => void;
}) => {
    const auth = useAuthentication();
    const navigate = useNavigate();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
    const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
    const [userToEditOrDelete, setUserToEditOrDelete] = useState<WinnerInformation | undefined>(undefined);
    const [packageSelections, setPackageSelections] = useState<{ [key: string]: string }>({});
    const [packageSelectionErrorStates, setPackageSelectionErrorStates] = useState<{ [key: string]: boolean }>({});

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

    const handleEditClick = (winner: WinnerInformation) => {
        return () => {
            setUserToEditOrDelete(winner);
            setEditDialogOpen(true);
        };
    };

    const handleRemoveParticipant = () => {
        // if we do not have an access token, skip fetching the infos
        if (auth.token.accessToken.length === 0) {
            return;
        }

        // since we have a token, we can query the backend for the winner count for the selected day
        fetch(`${API_BACKEND_URL}/participants/won/${userToEditOrDelete?.id}`, {
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
                setDeleteDialogOpen(false);
            })
            .catch(() => {
                // TODO: handle errors
            });
    };

    const handleDeleteClick = (user: WinnerInformation) => {
        return () => {
            setUserToEditOrDelete(user);
            setDeleteDialogOpen(true);
        };
    };

    const handleCloseDeleteDialog = () => {
        setDeleteDialogOpen(false);
    };

    const handleCloseEditDialog = () => {
        setEditDialogOpen(false);
    };

    const getPersonStyle = (winner: WinnerInformation) => {
        const baseStyle = {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
        };
        if (!winner.presentIdentifier) {
            return { ...baseStyle, color: 'red' };
        }
        return baseStyle;
    };

    const getPossiblePackageMenuItems = (userId: number, maxPackageCount: number) => {
        const alphabet = Array.from(Array(maxPackageCount))
            .map((_, i) => i + 65)
            .map((x) => String.fromCharCode(x));
        let items: ReactNode[] = [];

        items.push(
            <MenuItem key={`menu-item-not-selected-for-user-${userId}`} value={''}>
                -
            </MenuItem>
        );

        alphabet.map((character) => {
            items.push(
                <MenuItem key={`menu-item-${character}-for-user-${userId}`} value={character}>
                    {character}
                </MenuItem>
            );
        });

        return items;
    };

    const selectPackageForUser = (userId: number, selectedPackage: string) => {
        // if we do not have an access token, skip fetching the infos
        if (auth.token.accessToken.length === 0) {
            return;
        }

        // since we have a token, we can update the package selection for the given user id
        fetch(`${API_BACKEND_URL}/participants/${userId}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${auth.token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify({ package: selectedPackage }),
        })
            .then((res) => {
                // if we got a valid response from the backend, it should be JSON. We can convert it to a valid JSON
                // object and proceed processing it
                if (res.status === 204) {
                    return userId;
                }

                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (res.status === 401 || res.status === 403) {
                    logoutUser();
                    return Promise.reject();
                }

                // there should never be other status codes which have to be handled, but just in case, we'll handle
                // them here too
                return Promise.reject(); // TODO: implement this correctly
            })
            .then(() => {
                // update the value the user successfully set for the package
                let previousSelection = Object.assign({}, packageSelections); // recreate the json object so React sees a change
                previousSelection[userId] = selectedPackage;
                setPackageSelections(previousSelection);

                // clear a previous error state, if it existed
                let previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change
                previousErrorStates[userId] = false;
                setPackageSelectionErrorStates(previousErrorStates);
            })
            .catch(() => {
                let previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change
                previousErrorStates[userId] = true;
                setPackageSelectionErrorStates(previousErrorStates);
            });
    };

    return (
        <>
            <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog} aria-labelledby="alert-dialog-remove-participant-title" aria-describedby="alert-dialog-remove-participant-description">
                <DialogTitle id="alert-dialog-remove-participant-title">
                    <LocalizedText translationKey={'calendar.dialogs.remove_participant.title'} />
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-remove-participant-description">
                        <Stack>
                            <LocalizedText translationKey={'calendar.dialogs.remove_participant.text'} />
                            <ul>
                                <li>{`${userToEditOrDelete?.firstName} ${userToEditOrDelete?.lastName}`}</li>
                            </ul>
                        </Stack>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleRemoveParticipant}>
                        <LocalizedText translationKey={'calendar.dialogs.remove_participant.accept_button'} />
                    </Button>
                    <Button onClick={handleCloseDeleteDialog} autoFocus>
                        <LocalizedText translationKey={'calendar.dialogs.remove_participant.cancel_button'} />
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog open={editDialogOpen} onClose={handleCloseEditDialog} aria-labelledby="alert-dialog-edit-participant-title" aria-describedby="alert-dialog-edit-participant-description">
                <DialogTitle id="alert-dialog-edit-participant-title">
                    <LocalizedText translationKey={'calendar.dialogs.edit_participant.title'} />
                </DialogTitle>
                <DialogContent>
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>
                                        <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.column_winner'} />
                                    </TableCell>
                                    <TableCell>
                                        <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.column_package'} />
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                <TableRow key={userToEditOrDelete?.id}>
                                    <TableCell>
                                        {userToEditOrDelete?.firstName}&nbsp;{userToEditOrDelete?.lastName}
                                    </TableCell>
                                    <TableCell>
                                        <FormControl fullWidth>
                                            <InputLabel id={`winner-${userToEditOrDelete ? userToEditOrDelete.id : -1}-package-selection-label`}>
                                                <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.select.package_label'} />
                                            </InputLabel>
                                            <Select
                                                labelId={`winner-${userToEditOrDelete?.id}-package-selection-label`}
                                                id={`winner-${userToEditOrDelete?.id}-package-selection-value`}
                                                value={packageSelections[userToEditOrDelete ? userToEditOrDelete.id : -1] ? packageSelections[userToEditOrDelete ? userToEditOrDelete.id : -1] : ''}
                                                label={<LocalizedText translationKey={'calendar.dialogs.edit_participant.table.select.package_label'} />}
                                                onChange={(e) => selectPackageForUser(userToEditOrDelete ? userToEditOrDelete.id : -1, e.target.value)}
                                                error={
                                                    packageSelectionErrorStates[userToEditOrDelete ? userToEditOrDelete.id : -1]
                                                        ? packageSelectionErrorStates[userToEditOrDelete ? userToEditOrDelete.id : -1]
                                                        : false
                                                }
                                            >
                                                {getPossiblePackageMenuItems(userToEditOrDelete ? userToEditOrDelete.id : -1, numberOfMaxSubPackages)}
                                            </Select>
                                            <FormHelperText>
                                                {packageSelectionErrorStates[userToEditOrDelete ? userToEditOrDelete.id : -1] ? (
                                                    <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.error_package_selection'} />
                                                ) : (
                                                    ''
                                                )}
                                            </FormHelperText>
                                        </FormControl>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseEditDialog} autoFocus>
                        <LocalizedText translationKey={'calendar.dialogs.edit_participant.close_button'} />
                    </Button>
                </DialogActions>
            </Dialog>
            <Box sx={getPersonStyle(winner)}>
                <div style={{ display: 'flex' }}>
                    <Typography sx={{ textAlign: 'left' }}>{getShortenedName(`${winner.firstName} ${winner.lastName}`)}</Typography>
                    &nbsp;
                    <Typography sx={{ fontWeight: 'bold' }}>{`${winningDay}${winner.presentIdentifier ? winner.presentIdentifier : ''}`}</Typography>
                </div>
                <Button variant={'outlined'} sx={{ borderRadius: '20px', fontSize: 'x-small', textAlign: 'right' }} onClick={handleEditClick(winner)}>
                    <LocalizedText translationKey={'calendar.cards.winners.button_edit'} />
                </Button>
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
            elements.push(
                <PersonItem
                    key={`person-item-${sortedWinners[i].id}`}
                    numberOfMaxSubPackages={props.numberOfMaxSubPackages}
                    winner={sortedWinners[i]}
                    winningDay={winningDayFromDate}
                    updateWinnerList={props.updateWinnerList}
                />
            );
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
