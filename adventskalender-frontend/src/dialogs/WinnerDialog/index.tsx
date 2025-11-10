import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LocalizedText } from '../../components/LocalizedText';
import { ReactNode, useContext, useState } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router-dom';
import { API_BACKEND_URL, MAX_WINNERS_PER_DAY, WinnerInformation } from '../../api.ts';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { format, parse } from 'date-fns';
import { de } from 'date-fns/locale';
import { WinnerInformation2Schema } from '../../schemas';
import { z } from 'zod';
import { cn } from '@/lib/utils';

interface Props {
    winner: WinnerInformation[];
    numberOfMaxSubPackages: number;
    date: string;
    isOpen: boolean;
    setDialogOpenStateFunction: (shouldBeOpen: boolean) => void;
}

export const SpecialTextItem = ({ date }: { date: string }) => {
    const parsedDate = parse(date, 'yyyy-MM-dd', new Date());
    const winningDay = format(parsedDate, 'd');
    switch (winningDay) {
        case '6':
            return <LocalizedText translationKey={'dashboard.dialogs.new_winners.title2_special1'} variables={[winningDay]} />;
        case '24':
            return <LocalizedText translationKey={'dashboard.dialogs.new_winners.title2_special2'} variables={[winningDay]} />;
        default:
            return <LocalizedText translationKey={'dashboard.dialogs.new_winners.title2'} variables={[winningDay]} />;
    }
};

export const WinnerDialog = (props: Props) => {
    const auth = useAuthentication();
    const navigate = useNavigate();
    const localizationContext = useContext(LocalizationContext);
    const [activeStep, setActiveStep] = useState(0);
    const [packageSelections, setPackageSelections] = useState<StringMap>({});
    const [fetchedWinners, setFetchedWinners] = useState<WinnerInformation2[]>([]);
    const [fetchError, setFetchError] = useState<boolean>(false);
    const [packageSelectionErrorStates, setPackageSelectionErrorStates] = useState<BooleanMap>({});
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
        const deepCheckErrorValues = Object.keys(packageSelectionErrorStates).map((key) => {
            const isErrorState = packageSelectionErrorStates[key];
            if (isErrorState) {
                return packageSelections[key].length == 1 && USABLE_PACKAGE_ALPHABET.includes(packageSelections[key]);
            }
            return false;
        });
        return Object.values(deepCheckErrorValues).filter((item) => !item).length == 0;
    };

    const markPackagesNotSelectedAsError = () => {
        // get a copy of the currently selected packages and the error states
        const previouslySelectedPackages = Object.assign({}, packageSelections); // recreate the json object so React sees a change
        const previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change

        // for each not-selected package / participant, mark the field as 'error'
        // eslint-disable-next-line no-prototype-builtins
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
        prepareWinnerData(props.winner.length < MAX_WINNERS_PER_DAY);
        setActiveStep(activeStep + 1);
    };

    const handleDialogCancelClick = () => {
        unselectAllWinnersForDay();
    };

    const getPossiblePackageMenuItems = (userId: number, maxPackageCount: number) => {
        const items: ReactNode[] = [];
        const alphabet = Array.from(Array(maxPackageCount))
            .map((_, i) => i + 65)
            .map((x) => String.fromCharCode(x));

        items.push(
            <SelectItem key={`menu-item-not-selected-for-user-${userId}`} value="__none__">
                -
            </SelectItem>
        );

        alphabet.map((character) => {
            items.push(
                <SelectItem key={`menu-item-${character}-for-user-${userId}`} value={character}>
                    {character}
                </SelectItem>
            );
        });

        return items;
    };

    const handleFillPackageSelectionAutomatically = () => {
        if (import.meta.env.DEV) {
            const selectedPackages: StringMap = {};
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
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        // get all ids of the winners
        const winnerIds = props.winner.map((currentWinner) => currentWinner.id);

        // since we have a token, we can now unselect all participants
        Promise.all(
            winnerIds.map(async (winnerId) => {
                const res = await fetch(`${API_BACKEND_URL}/participants/won/${winnerId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-type': 'application/json; charset=UTF-8',
                    },
                    credentials: 'include',
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
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        // Convert "__none__" sentinel value to empty string for the API
        const packageValue = selectedPackage === '__none__' ? '' : selectedPackage;

        // since we have a token, we can update the package selection for the given user id
        fetch(`${API_BACKEND_URL}/participants/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
            credentials: 'include',
            body: JSON.stringify({ package: packageValue }),
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
                    const previousSelection = Object.assign({}, packageSelections); // recreate the json object so React sees a change
                    previousSelection[userId] = selectedPackage;
                    setPackageSelections(previousSelection);

                    // clear a previous error state, if it existed
                    const previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change
                    previousErrorStates[userId] = false;
                    setPackageSelectionErrorStates(previousErrorStates);
                }
            })
            .catch(() => {
                if (doUpdateState) {
                    const previousErrorStates = Object.assign({}, packageSelectionErrorStates); // recreate the json object so React sees a change
                    previousErrorStates[userId] = true;
                    setPackageSelectionErrorStates(previousErrorStates);
                }
            });
    };

    const prepareWinnerData = (refetchWinners: boolean) => {
        if (refetchWinners) {
            // Fetch winners from backend to get all winners for the day
            fetch(`${API_BACKEND_URL}/participants/won/${props.date}`, {
                method: 'GET',
                headers: {
                    'Content-type': 'application/json; charset=UTF-8',
                },
                credentials: 'include',
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
                    return Promise.reject();
                })
                .then((data) => {
                    // Validate the response data using Zod schema
                    const validated = z.array(WinnerInformation2Schema).parse(data);
                    setFetchedWinners(validated);
                    setFetchError(false);
                })
                .catch(() => {
                    setFetchError(true);
                });
        } else {
            // Clear fetched winners when not refetching
            setFetchedWinners([]);
            setFetchError(false);
        }
    };

    const renderWinnerText = () => {
        const parsedDate = parse(props.date, 'yyyy-MM-dd', new Date());
        // Determine locale based on browser language (German or English)
        const locale = window.navigator.language.startsWith('de') ? de : undefined;
        const winningDate = format(parsedDate, localizationContext.translate('dashboard.dialogs.new_winners.date_format'), { locale });
        const winningDay = format(parsedDate, 'd');

        // Check if we have an error
        if (fetchError) {
            return <span className="text-destructive">Error loading winners</span>;
        }

        // Determine which winners to display and sort them by package identifier
        const sortedWinners =
            fetchedWinners.length > 0
                ? [...fetchedWinners].sort((a, b) => {
                      const packageA = a.present_identifier || '?';
                      const packageB = b.present_identifier || '?';
                      return packageA > packageB ? 1 : -1;
                  })
                : [...props.winner].sort((a, b) => {
                      const packageA = packageSelections[a.id] || '?';
                      const packageB = packageSelections[b.id] || '?';
                      return packageA > packageB ? 1 : -1;
                  });

        return (
            <>
                {localizationContext.translate('dashboard.dialogs.new_winners.winner_paragraph_prefix')} {winningDate}:{' '}
                {sortedWinners.map((winner, index) => {
                    let firstName: string;
                    let lastName: string;
                    let presentId: string | null | undefined;

                    if (fetchedWinners.length > 0) {
                        // Using fetched winners (WinnerInformation2 format)
                        const w = winner as WinnerInformation2;
                        firstName = w.first_name;
                        lastName = w.last_name;
                        presentId = w.present_identifier;
                    } else {
                        // Using props.winner (WinnerInformation format)
                        const w = winner as WinnerInformation;
                        firstName = w.firstName;
                        lastName = w.lastName;
                        presentId = packageSelections[w.id];
                    }

                    return (
                        <span key={index}>
                            {index > 0 && ', '}
                            <strong>
                                {firstName} {lastName}
                            </strong>{' '}
                            ({winningDay}
                            {presentId})
                        </span>
                    );
                })}
            </>
        );
    };

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && handleDialogCancelClick()}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{activeStep === 0 ? <LocalizedText translationKey={'dashboard.dialogs.new_winners.title'} /> : <SpecialTextItem date={props.date} />}</DialogTitle>
                    {activeStep === 0 && (
                        <DialogDescription>
                            <LocalizedText translationKey={'dashboard.dialogs.new_winners.text'} />
                        </DialogDescription>
                    )}
                </DialogHeader>
                {activeStep === 0 ? (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        <LocalizedText translationKey={'dashboard.dialogs.new_winners.table.column_winner'} />
                                    </TableHead>
                                    <TableHead>
                                        <LocalizedText translationKey={'dashboard.dialogs.new_winners.table.column_package'} />
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {props.winner.map((currentWinner) => {
                                    return (
                                        <TableRow key={currentWinner.id}>
                                            <TableCell>
                                                {currentWinner.firstName}&nbsp;{currentWinner.lastName}
                                            </TableCell>
                                            <TableCell>
                                                <div className="w-full space-y-1">
                                                    <Label htmlFor={`winner-${currentWinner.id}-package-selection`} className="sr-only">
                                                        <LocalizedText translationKey={'dashboard.dialogs.new_winners.table.select.package_label'} />
                                                    </Label>
                                                    <Select value={packageSelections[currentWinner.id] || '__none__'} onValueChange={(value) => selectPackageForUser(currentWinner.id, value)}>
                                                        <SelectTrigger
                                                            id={`winner-${currentWinner.id}-package-selection`}
                                                            className={cn('w-full', packageSelectionErrorStates[currentWinner.id] && 'border-destructive focus-visible:ring-destructive')}
                                                            aria-invalid={packageSelectionErrorStates[currentWinner.id]}
                                                        >
                                                            <SelectValue placeholder="-" />
                                                        </SelectTrigger>
                                                        <SelectContent>{getPossiblePackageMenuItems(currentWinner.id, props.numberOfMaxSubPackages)}</SelectContent>
                                                    </Select>
                                                    {packageSelectionErrorStates[currentWinner.id] && (
                                                        <p className="text-sm text-destructive" role="alert">
                                                            <LocalizedText translationKey={'dashboard.dialogs.new_winners.table.error_package_selection'} />
                                                        </p>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-sm text-foreground">{renderWinnerText()}</div>
                )}
                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {import.meta.env.DEV && (
                        <Button variant="secondary" onClick={handleFillPackageSelectionAutomatically} className="sm:mr-auto">
                            <LocalizedText translationKey={'dashboard.dialogs.new_winners.autofill_button'} />
                        </Button>
                    )}
                    <Button variant="destructive" onClick={handleDialogCancelClick}>
                        <LocalizedText translationKey={'dashboard.dialogs.new_winners.cancel_button'} />
                    </Button>
                    <Button onClick={activeStep === 0 ? handleDialogNextPage : handleDialogClose}>
                        <LocalizedText translationKey={activeStep === 0 ? 'dashboard.dialogs.new_winners.accept_button' : 'dashboard.dialogs.new_winners.finish_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
