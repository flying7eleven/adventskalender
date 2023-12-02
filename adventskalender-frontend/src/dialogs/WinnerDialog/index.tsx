import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import { LocalizedText } from '../../components/LocalizedText';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { ReactNode, useContext, useState } from 'react';
import { FormHelperText, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import Paper from '@mui/material/Paper';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { API_BACKEND_URL, MAX_WINNERS_PER_DAY, WinnerInformation } from '../../api.ts';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import { LocalizationContext } from '../../provider/LocalizationProvider';
import moment from 'moment';
import 'moment/dist/locale/de.js'; // german is besides english the only other supported language

interface Props {
    winner: WinnerInformation[];
    numberOfMaxSubPackages: number;
    date: string;
    isOpen: boolean;
    setDialogOpenStateFunction: (shouldBeOpen: boolean) => void;
}

export const WinnerDialog = (props: Props) => {
    const auth = useAuthentication();
    const navigate = useNavigate();
    const localizationContext = useContext(LocalizationContext);
    const [activeStep, setActiveStep] = useState(0);
    const [packageSelections, setPackageSelections] = useState<StringMap>({});
    const [winnerText, setWinnerText] = useState<string>('');
    const [packageSelectionErrorStates, setPackageSelectionErrorStates] = useState<BooleanMap>({});
    const stepLabels = [localizationContext.translate('dashboard.dialogs.new_winners.steps.selection_step'), localizationContext.translate('dashboard.dialogs.new_winners.steps.finish_step')];
    const USABLE_PACKAGE_ALPHABET = Array.from(Array(MAX_WINNERS_PER_DAY))
        .map((_, i) => i + 65)
        .map((x) => String.fromCharCode(x));

    const allSubPackagesAreSelected = () => {
        // ensure we have selected a package for each winner
        if (Object.keys(packageSelections).length != props.winner.length) {
            return false;
        }

        // if all error states are negative, we can assume that we can proceed to the next step
        if (Object.values(packageSelectionErrorStates).filter((item) => item).length == 0) {
            return true;
        }

        // if there are error states, there might be reasons to proceed anyway, now we have to check for them
        // one of the reasons can be that a user re-picked a winner and selected a free package for him or her and then
        // proceeded to select an already an invalid package. The control gets into an error state where the user cannot
        // recover from. If this happens, we can ignore the error state since a package was selected for the user
        let deepCheckErrorValues = Object.keys(packageSelectionErrorStates).map((key) => {
            let isErrorState = packageSelectionErrorStates[key];
            if (isErrorState) {
                return packageSelections[key].length == 1 && USABLE_PACKAGE_ALPHABET.includes(packageSelections[key]);
            }
            return false;
        });
        return Object.values(deepCheckErrorValues).filter((item) => !item).length == 0;
    };

    const markPackagesNotSelectedAsError = () => {
        // get a copy of the currently selected packages and the error states
        let previouslySelectedPackages = Object.assign({}, packageSelections); // recreate the json object so React sees a change
        let previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change

        // for each not-selected package / participant, mark the field as 'error'
        props.winner.filter((currentWinner) => !previouslySelectedPackages.hasOwnProperty(currentWinner.id)).map((winnerNotFound) => (previousErrorStates[winnerNotFound.id] = true));

        // set the new error states
        setPackageSelectionErrorStates(previousErrorStates);
    };

    const handleDialogClose = () => {
        setActiveStep(0);
        setPackageSelections({});
        setPackageSelectionErrorStates({});
        props.setDialogOpenStateFunction(false);
    };

    const handleDialogNextPage = () => {
        if (!allSubPackagesAreSelected()) {
            markPackagesNotSelectedAsError();
            return;
        }
        prepareWinnerText(props.winner.length < MAX_WINNERS_PER_DAY);
        setActiveStep(activeStep + 1);
    };

    const handleDialogCancelClick = () => {
        unselectAllWinnersForDay();
    };

    const getPossiblePackageMenuItems = (userId: number, maxPackageCount: number) => {
        let items: ReactNode[] = [];
        const alphabet = Array.from(Array(maxPackageCount))
            .map((_, i) => i + 65)
            .map((x) => String.fromCharCode(x));

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

    const handleFillPackageSelectionAutomatically = () => {
        if (import.meta.env.DEV) {
            let selectedPackages: StringMap = {};
            let currentAlphabetIdx = 0;
            props.winner
                .map((currentWinner) => currentWinner.id)
                .forEach((id) => {
                    selectedPackages[id.toString()] = USABLE_PACKAGE_ALPHABET[currentAlphabetIdx++];
                    selectPackageForUser(id, selectedPackages[id.toString()], false);
                });
            setPackageSelections(selectedPackages);
        }
    };

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    const unselectAllWinnersForDay = () => {
        // if we do not have an access token, skip fetching the infos
        if (auth.token.accessToken.length === 0) {
            return;
        }

        // get all ids of the winners
        const winnerIds = props.winner.map((currentWinner) => currentWinner.id);

        // since we have a token, we can now unselect all participants
        Promise.all(
            winnerIds.map(async (winnerId) => {
                let res = await fetch(`${API_BACKEND_URL}/participants/won/${winnerId}`, {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${auth.token.accessToken}`,
                        'Content-type': 'application/json; charset=UTF-8',
                    },
                });
                if (res.status === 204) {
                    return;
                }
                if (res.status === 401 || res.status === 403) {
                    logoutUser();
                    return Promise.reject();
                }
                return Promise.reject();
            })
        )
            .then(handleDialogClose)
            .catch(() => {
                // FIXME: show an actual error message that this was not successful
            });
    };

    const selectPackageForUser = (userId: number, selectedPackage: string, doUpdateState: boolean = true) => {
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
                if (doUpdateState) {
                    // update the value the user successfully set for the package
                    let previousSelection = Object.assign({}, packageSelections); // recreate the json object so React sees a change
                    previousSelection[userId] = selectedPackage;
                    setPackageSelections(previousSelection);

                    // clear a previous error state, if it existed
                    let previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change
                    previousErrorStates[userId] = false;
                    setPackageSelectionErrorStates(previousErrorStates);
                }
            })
            .catch(() => {
                if (doUpdateState) {
                    let previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change
                    previousErrorStates[userId] = true;
                    setPackageSelectionErrorStates(previousErrorStates);
                }
            });
    };

    const prepareWinnerText = (refetchWinners: boolean) => {
        let winnerParagraphTemplate = localizationContext.translate('dashboard.dialogs.new_winners.winner_paragraph_template');
        let winningDate = moment(props.date, 'YYYY-MM-DD').format(localizationContext.translate('dashboard.dialogs.new_winners.date_format'));
        let winningDay = moment(props.date, 'YYYY-MM-DD').format('D');

        if (refetchWinners) {
            fetch(`${API_BACKEND_URL}/participants/won/${props.date}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${auth.token.accessToken}`,
                    'Content-type': 'application/json; charset=UTF-8',
                },
            })
                .then((res) => {
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
                    return Promise.reject(); // TODO: implement this correctly
                })
                .then((winner: WinnerInformation2[]) => {
                    setWinnerText(
                        winnerParagraphTemplate
                            .replace(
                                '{1}',
                                winner
                                    .sort((winnerA, winnerB) => {
                                        let packageA = winnerA.present_identifier ? winnerA.present_identifier : '?';
                                        let packageB = winnerB.present_identifier ? winnerB.present_identifier : '?';
                                        if (packageA > packageB) {
                                            return 1;
                                        }
                                        return -1;
                                    })
                                    .map((winner) => {
                                        return `<b>${winner.first_name} ${winner.last_name}</b> (${winningDay}${winner.present_identifier})`;
                                    })
                                    .join(', ')
                            )
                            .replace('{0}', winningDate)
                    );
                })
                .catch(() => {
                    setWinnerText('ERROR'); // TODO: add better handling
                });
        } else {
            setWinnerText(
                winnerParagraphTemplate
                    .replace(
                        '{1}',
                        props.winner
                            .sort((winnerA, winnerB) => {
                                if (packageSelections[winnerA.id] > packageSelections[winnerB.id]) {
                                    return 1;
                                }
                                return -1;
                            })
                            .map((winner) => {
                                let selectedPackage = packageSelections[winner.id];
                                return `<b>${winner.firstName} ${winner.lastName}</b> (${winningDay}${selectedPackage})`;
                            })
                            .join(', ')
                    )
                    .replace('{0}', winningDate)
            );
        }
    };

    return (
        <Dialog open={props.isOpen} onClose={handleDialogCancelClick} aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
            <DialogTitle id="alert-dialog-title">
                <LocalizedText translationKey={'dashboard.dialogs.new_winners.title'} />
            </DialogTitle>
            <DialogContent>
                {activeStep === 0 ? (
                    <>
                        <DialogContentText id="alert-dialog-description">
                            <LocalizedText translationKey={'dashboard.dialogs.new_winners.text'} />
                            <br />
                            <br />
                        </DialogContentText>
                    </>
                ) : (
                    <></>
                )}
                <Stepper activeStep={activeStep} hidden>
                    {stepLabels.map((label, _) => {
                        return (
                            <Step key={label} hidden>
                                <StepLabel>{label}</StepLabel>
                            </Step>
                        );
                    })}
                </Stepper>
                <br />
                {activeStep === 0 ? (
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
                                                        {getPossiblePackageMenuItems(currentWinner.id, props.numberOfMaxSubPackages)}
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
                ) : (
                    <>
                        <DialogContentText id="alert-dialog-description" dangerouslySetInnerHTML={{ __html: winnerText }} />
                    </>
                )}
            </DialogContent>
            <DialogActions>
                {import.meta.env.DEV && (
                    <Button onClick={handleFillPackageSelectionAutomatically} color={'warning'}>
                        <LocalizedText translationKey={'dashboard.dialogs.new_winners.autofill_button'} />
                    </Button>
                )}
                <Button onClick={handleDialogCancelClick} color={'error'}>
                    <LocalizedText translationKey={'dashboard.dialogs.new_winners.cancel_button'} />
                </Button>
                <Button onClick={activeStep === 0 ? handleDialogNextPage : handleDialogClose} autoFocus>
                    <LocalizedText translationKey={activeStep === 0 ? 'dashboard.dialogs.new_winners.accept_button' : 'dashboard.dialogs.new_winners.finish_button'} />
                </Button>
            </DialogActions>
        </Dialog>
    );
};
