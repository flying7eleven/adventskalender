import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LocalizedText } from '../../components/LocalizedText';
import { PackageSelectItems } from '../../components/PackageSelectItems';
import { ApiAuthExpiredError, apiFetch, WinnerInformation } from '../../api.ts';
import { Dispatch, SetStateAction, useState } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';

interface Props {
    listOfWinner: WinnerInformation[];
    isOpen: boolean;
    numberOfMaxSubPackages: number;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
    packageSelections: Record<string, string>;
    updateWinnerList?: () => void;
}

export const EditWinnerDialog = (props: Props) => {
    const [packageSelectionErrorStates, setPackageSelectionErrorStates] = useState<{ [key: string]: boolean }>({});
    const auth = useAuthentication();
    const navigate = useNavigate();
    const [packageSelections, setPackageSelections] = useState<Record<string, string>>(props.packageSelections);
    const [syncedPackageSelections, setSyncedPackageSelections] = useState<Record<string, string>>(props.packageSelections);
    if (syncedPackageSelections !== props.packageSelections) {
        setSyncedPackageSelections(props.packageSelections);
        setPackageSelections(props.packageSelections);
    }

    const selectPackageForUser = (userId: number, selectedPackage: string) => {
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        const packageValue = selectedPackage === '__none__' ? '' : selectedPackage;

        apiFetch(`/participants/${userId}`, { method: 'PUT', body: { package: packageValue } })
            .then(() => {
                setPackageSelections((previousSelections) => ({ ...previousSelections, [userId]: packageValue }));
                setPackageSelectionErrorStates((previousErrorStates) => ({ ...previousErrorStates, [userId]: false }));

                if (props.updateWinnerList) {
                    props.updateWinnerList();
                }
            })
            .catch((error: unknown) => {
                if (error instanceof ApiAuthExpiredError) {
                    logoutUser();
                }
                setPackageSelectionErrorStates((previousErrorStates) => ({ ...previousErrorStates, [userId]: true }));
            });
    };

    const logoutUser = () => {
        auth.signout(() => navigate('/'));
    };

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.setDialogOpenStateFunction(false)}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        <LocalizedText translationKey={'calendar.dialogs.edit_participant.title'} />
                    </DialogTitle>
                </DialogHeader>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>
                                    <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.column_winner'} />
                                </TableHead>
                                <TableHead>
                                    <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.column_package'} />
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {props.listOfWinner.map((currentWinner) => {
                                return (
                                    <TableRow key={currentWinner.id}>
                                        <TableCell>
                                            {currentWinner.firstName}&nbsp;{currentWinner.lastName}
                                        </TableCell>
                                        <TableCell>
                                            <div className="w-full space-y-1">
                                                <Label htmlFor={`winner-${currentWinner.id}-package-selection`} className="sr-only">
                                                    <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.select.package_label'} />
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
                                                        <LocalizedText translationKey={'calendar.dialogs.edit_participant.table.error_package_selection'} />
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
                <DialogFooter>
                    <Button onClick={() => props.setDialogOpenStateFunction(false)}>
                        <LocalizedText translationKey={'calendar.dialogs.edit_participant.close_button'} />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
