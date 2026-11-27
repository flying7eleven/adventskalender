import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LocalizedText } from '../../components/LocalizedText';
import { PackageSelectItems } from '../../components/PackageSelectItems';
import { SpecialTextItem, WinnerSummary } from '../../components/WinnerSummary';
import { useContext, useState } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router';
import { ApiAuthExpiredError, ApiResponseError, apiFetch, MAX_WINNERS_PER_DAY, WinnerInformation } from '../../api.ts';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { Participant, ParticipantSchema } from '../../schemas';
import { toast } from 'sonner';
import { z } from 'zod';
import { cn } from '@/lib/utils';

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
    const [packageSelections, setPackageSelections] = useState<Record<string, string>>({});
    const [fetchedWinners, setFetchedWinners] = useState<Participant[]>([]);
    const [fetchError, setFetchError] = useState<boolean>(false);
    const [packageSelectionErrorStates, setPackageSelectionErrorStates] = useState<Record<string, boolean>>({});
    const [unpickedWinnerIds, setUnpickedWinnerIds] = useState<number[]>([]);
    const remainingWinners = props.winner.filter((currentWinner) => !unpickedWinnerIds.includes(currentWinner.id));
    const USABLE_PACKAGE_ALPHABET = Array.from(Array(MAX_WINNERS_PER_DAY))
        .map((_, i) => i + 65)
        .map((x) => String.fromCharCode(x));

    const allSubPackagesAreSelected = () => {
        // ensure we have selected a package for each winner
        if (remainingWinners.some((currentWinner) => packageSelections[currentWinner.id] === undefined)) {
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
        remainingWinners.filter((currentWinner) => !previouslySelectedPackages.hasOwnProperty(currentWinner.id)).map((winnerNotFound) => (previousErrorStates[winnerNotFound.id] = true));

        // set the new error states
        setPackageSelectionErrorStates(previousErrorStates);
    };

    const handleDialogClose = () => {
        setActiveStep(0);
        setPackageSelections({});
        setPackageSelectionErrorStates({});
        setUnpickedWinnerIds([]);
        props.setDialogOpenStateFunction(false);
    };

    const handleDialogNextPage = () => {
        if (!allSubPackagesAreSelected()) {
            markPackagesNotSelectedAsError();
            return;
        }
        prepareWinnerData(remainingWinners.length < MAX_WINNERS_PER_DAY);
        setActiveStep(activeStep + 1);
    };

    const handleDialogCancelClick = () => {
        unselectAllWinnersForDay();
    };

    const handleFillPackageSelectionAutomatically = () => {
        if (__DEV__) {
            const selectedPackages: Record<string, string> = {};
            let currentAlphabetIdx = 0;
            remainingWinners
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

        const winnerIds = remainingWinners.map((currentWinner) => currentWinner.id);

        Promise.allSettled(winnerIds.map((winnerId) => apiFetch(`/participants/won/${winnerId}`, { method: 'DELETE' }))).then((results) => {
            const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
            if (failures.length === 0) {
                handleDialogClose();
                return;
            }
            if (failures.some((failure) => failure.reason instanceof ApiAuthExpiredError)) {
                logoutUser();
                return;
            }
            const newlyUnpickedIds = winnerIds.filter((_, index) => results[index].status === 'fulfilled');
            setUnpickedWinnerIds((previousIds) => [...previousIds, ...newlyUnpickedIds]);
            toast.error(localizationContext.translate('dashboard.dialogs.new_winners.error_unpick'), {
                duration: 6000,
            });
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
        apiFetch(`/participants/${userId}`, { method: 'PUT', body: { package: packageValue } })
            .then(() => {
                if (doUpdateState) {
                    setPackageSelections((previousSelections) => ({ ...previousSelections, [userId]: packageValue }));
                    setPackageSelectionErrorStates((previousErrorStates) => ({ ...previousErrorStates, [userId]: false }));
                }
            })
            .catch((error: unknown) => {
                // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                // the user should automatically be redirected to the login page
                if (error instanceof ApiAuthExpiredError) {
                    logoutUser();
                }
                if (error instanceof ApiResponseError && error.status === 409) {
                    toast.error(localizationContext.translate('dashboard.dialogs.new_winners.error_package_taken'), { duration: 6000 });
                }
                if (error instanceof ApiResponseError && error.status === 422) {
                    toast.error(localizationContext.translate('dashboard.dialogs.new_winners.table.error_package_selection'), { duration: 6000 });
                }
                if (doUpdateState) {
                    setPackageSelectionErrorStates((previousErrorStates) => ({ ...previousErrorStates, [userId]: true }));
                }
            });
    };

    const prepareWinnerData = (refetchWinners: boolean) => {
        if (refetchWinners) {
            // Fetch winners from backend to get all winners for the day
            apiFetch(`/participants/won/${props.date}`, z.array(ParticipantSchema))
                .then((winners) => {
                    setFetchedWinners(winners);
                    setFetchError(false);
                })
                .catch((error: unknown) => {
                    // if it seems that we are not authorized, invalidate the token. By invalidating the token,
                    // the user should automatically be redirected to the login page
                    if (error instanceof ApiAuthExpiredError) {
                        logoutUser();
                    }
                    setFetchError(true);
                });
        } else {
            // Clear fetched winners when not refetching
            setFetchedWinners([]);
            setFetchError(false);
        }
    };

    const renderWinnerText = () => {
        if (fetchError) {
            return <span className="text-destructive">Error loading winners</span>;
        }

        const summarizedWinners: WinnerInformation[] =
            fetchedWinners.length > 0
                ? fetchedWinners.map((winner) => ({ id: winner.id, firstName: winner.first_name, lastName: winner.last_name, presentIdentifier: winner.present_identifier }))
                : remainingWinners.map((winner) => ({ ...winner, presentIdentifier: packageSelections[winner.id] }));

        return <WinnerSummary date={props.date} winners={summarizedWinners} />;
    };

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && (activeStep === 0 ? handleDialogCancelClick() : handleDialogClose())}>
            <DialogContent
                className="max-w-3xl max-h-[80vh] overflow-y-auto"
                onEscapeKeyDown={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
            >
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
                                {remainingWinners.map((currentWinner) => {
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
                                                        <SelectContent>
                                                            <PackageSelectItems userId={currentWinner.id} maxPackageCount={props.numberOfMaxSubPackages} />
                                                        </SelectContent>
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
                    {__DEV__ && (
                        <Button variant="secondary" onClick={handleFillPackageSelectionAutomatically} className="sm:mr-auto">
                            <LocalizedText translationKey={'dashboard.dialogs.new_winners.autofill_button'} />
                        </Button>
                    )}
                    {activeStep === 0 && (
                        <Button variant="destructive" onClick={handleDialogCancelClick}>
                            <LocalizedText translationKey={'dashboard.dialogs.new_winners.cancel_button'} />
                        </Button>
                    )}
                    <Button onClick={activeStep === 0 ? handleDialogNextPage : handleDialogClose}>
                        <LocalizedText translationKey={activeStep === 0 ? 'dashboard.dialogs.new_winners.accept_button' : 'dashboard.dialogs.new_winners.finish_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
