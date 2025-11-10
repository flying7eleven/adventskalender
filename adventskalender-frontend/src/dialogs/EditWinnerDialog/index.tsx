import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import { LocalizedText } from '../../components/LocalizedText';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { Button } from '@/components/ui/button';
import { FormHelperText, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import Paper from '@mui/material/Paper';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import { API_BACKEND_URL, WinnerInformation } from '../../api.ts';
import { Dispatch, ReactNode, SetStateAction, useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';

interface Props {
    listOfWinner: WinnerInformation[];
    isOpen: boolean;
    numberOfMaxSubPackages: number;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
    packageSelections: StringMap;
}

export const EditWinnerDialog = (props: Props) => {
    const [packageSelectionErrorStates, setPackageSelectionErrorStates] = useState<{ [key: string]: boolean }>({});
    const auth = useAuthentication();
    const navigate = useNavigate();
    const [packageSelections, setPackageSelections] = useState<{ [key: string]: string }>({});

    const getPossiblePackageMenuItems = (userId: number, maxPackageCount: number) => {
        const alphabet = Array.from(Array(maxPackageCount))
            .map((_, i) => i + 65)
            .map((x) => String.fromCharCode(x));
        const items: ReactNode[] = [];

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
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        // since we have a token, we can update the package selection for the given user id
        fetch(`${API_BACKEND_URL}/participants/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
            credentials: 'include',
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
                const previousSelection = Object.assign({}, packageSelections); // recreate the json object so React sees a change
                previousSelection[userId] = selectedPackage;
                setPackageSelections(previousSelection);

                // clear a previous error state, if it existed
                const previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change
                previousErrorStates[userId] = false;
                setPackageSelectionErrorStates(previousErrorStates);
            })
            .catch(() => {
                const previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change
                previousErrorStates[userId] = true;
                setPackageSelectionErrorStates(previousErrorStates);
            });
    };

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    return (
        <Dialog open={props.isOpen} aria-labelledby="alert-dialog-edit-participant-title" aria-describedby="alert-dialog-edit-participant-description">
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
                            {props.listOfWinner.map((currentWinner) => {
                                return (
                                    <TableRow key={currentWinner.id}>
                                        <TableCell>
                                            {currentWinner.firstName}&nbsp;{currentWinner.lastName}
                                        </TableCell>
                                        <TableCell>
                                            <FormControl fullWidth>
                                                <InputLabel id={`winner-${currentWinner.id}-package-selection-label`}>
                                                    <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.select.package_label'} />
                                                </InputLabel>
                                                <Select
                                                    labelId={`winner-${currentWinner.id}-package-selection-label`}
                                                    id={`winner-${currentWinner.id}-package-selection-value`}
                                                    value={packageSelections[currentWinner.id] ? packageSelections[currentWinner.id] : ''}
                                                    label={<LocalizedText translationKey={'calendar.dialogs.edit_participant.table.select.package_label'} />}
                                                    onChange={(e) => selectPackageForUser(currentWinner.id, e.target.value)}
                                                    error={packageSelectionErrorStates[currentWinner.id] ? packageSelectionErrorStates[currentWinner.id] : false}
                                                >
                                                    {getPossiblePackageMenuItems(currentWinner.id, props.numberOfMaxSubPackages)}
                                                </Select>
                                                <FormHelperText>
                                                    {packageSelectionErrorStates[currentWinner.id] ? (
                                                        <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.error_package_selection'} />
                                                    ) : (
                                                        ''
                                                    )}
                                                </FormHelperText>
                                            </FormControl>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.setDialogOpenStateFunction(false)} autoFocus>
                    <LocalizedText translationKey={'calendar.dialogs.edit_participant.close_button'} />
                </Button>
            </DialogActions>
        </Dialog>
    );
};
