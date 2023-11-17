import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import { LocalizedText } from '../../components/LocalizedText';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { Dispatch, ReactNode, SetStateAction, useState } from 'react';
import { FormHelperText, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import Paper from '@mui/material/Paper';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { API_BACKEND_URL } from '../../api.ts';

interface Props {
    winner: WinnerInformation[];
    isOpen: boolean;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
}

export const WinnerDialog = (props: Props) => {
    const auth = useAuthentication();
    const navigate = useNavigate();
    const [packageSelections, setPackageSelections] = useState<{ [key: string]: string }>({});
    const [packageSelectionErrorStates, setPackageSelectionErrorStates] = useState<{ [key: string]: boolean }>({});

    const allSubPackagesAreSelected = () => {
        // ensure we have selected a package for each winner
        // TODO: use the select value for the number of participants for that day and not the passed winners (for re-draw)
        if (Object.keys(packageSelections).length != props.winner.length) {
            return false;
        }

        // be sure that all error states are negative
        return Object.values(packageSelectionErrorStates).filter((item) => item).length == 0;
    };

    const showAlertForPackageSelection = () => {
        // TODO implement: this
    };

    const handleDialogClose = () => {
        if (!allSubPackagesAreSelected()) {
            showAlertForPackageSelection();
            return;
        }
        props.setDialogOpenStateFunction(false);
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

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
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
        <Dialog open={props.isOpen} onClose={handleDialogClose} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
            <DialogTitle id="alert-dialog-title">
                <LocalizedText translationKey={'dashboard.dialogs.new_winners.title'} />
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="alert-dialog-description">
                    <LocalizedText translationKey={'dashboard.dialogs.new_winners.text'} />
                </DialogContentText>
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>
                                    <LocalizedText translationKey={'dashboard.dialogs.new_winners.table.column_winner'} />
                                </TableCell>
                                <TableCell>
                                    <LocalizedText translationKey={'dashboard.dialogs.new_winners.table.column_package'} />
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {props.winner.map((currentWinner) => {
                                return (
                                    <TableRow key={currentWinner.id}>
                                        <TableCell>
                                            {currentWinner.firstName}&nbsp;{currentWinner.lastName}
                                        </TableCell>
                                        <TableCell>
                                            <FormControl fullWidth>
                                                <InputLabel id={`winner-${currentWinner.id}-package-selection-label`}>
                                                    <LocalizedText translationKey={'dashboard.dialogs.new_winners.table.select.package_label'} />
                                                </InputLabel>
                                                <Select
                                                    labelId={`winner-${currentWinner.id}-package-selection-label`}
                                                    id={`winner-${currentWinner.id}-package-selection-value`}
                                                    value={packageSelections[currentWinner.id] ? packageSelections[currentWinner.id] : ''}
                                                    label={<LocalizedText translationKey={'dashboard.dialogs.new_winners.table.select.package_label'} />}
                                                    onChange={(e) => selectPackageForUser(currentWinner.id, e.target.value)}
                                                    error={packageSelectionErrorStates[currentWinner.id] ? packageSelectionErrorStates[currentWinner.id] : false}
                                                >
                                                    {getPossiblePackageMenuItems(
                                                        currentWinner.id,
                                                        props.winner.length // TODO: use the select value for the number of participants for that day and not the passed winners (for re-draw)
                                                    )}
                                                </Select>
                                                <FormHelperText>
                                                    {packageSelectionErrorStates[currentWinner.id] ? (
                                                        <LocalizedText translationKey={'dashboard.dialogs.new_winners.table.error_package_selection'} />
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
                <Button onClick={handleDialogClose} autoFocus>
                    <LocalizedText translationKey={'dashboard.dialogs.new_winners.accept_button'} />
                </Button>
            </DialogActions>
        </Dialog>
    );
};
