import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LocalizedText } from '../../components/LocalizedText';
import { API_BACKEND_URL, WinnerInformation } from '../../api.ts';
import { Dispatch, ReactNode, SetStateAction, useEffect, useState } from 'react';
import { useAuthentication } from '../../hooks/useAuthentication';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';

interface Props {
    listOfWinner: WinnerInformation[];
    isOpen: boolean;
    numberOfMaxSubPackages: number;
    setDialogOpenStateFunction: Dispatch<SetStateAction<boolean>>;
    packageSelections: StringMap;
    updateWinnerList?: () => void;
}

export const EditWinnerDialog = (props: Props) => {
    const [packageSelectionErrorStates, setPackageSelectionErrorStates] = useState<{ [key: string]: boolean }>({});
    const auth = useAuthentication();
    const navigate = useNavigate();
    const [packageSelections, setPackageSelections] = useState<StringMap>(Object.keys(props.packageSelections).length > 0 ? props.packageSelections : {});
    useEffect(() => {
        setPackageSelections(Object.keys(props.packageSelections).length > 0 ? props.packageSelections : {});
    }, [props.packageSelections]);

    const getPossiblePackageMenuItems = (userId: number, maxPackageCount: number) => {
        const alphabet = Array.from(Array(maxPackageCount))
            .map((_, i) => i + 65)
            .map((x) => String.fromCharCode(x));
        const items: ReactNode[] = [];

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

    const selectPackageForUser = (userId: number, selectedPackage: string) => {
        // if we are not authenticated, skip fetching the infos
        if (!auth.isAuthenticated) {
            return;
        }

        const packageValue = selectedPackage === '__none__' ? '' : selectedPackage;

        fetch(`${API_BACKEND_URL}/participants/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
            credentials: 'include',
            body: JSON.stringify({ package: packageValue }),
        })
            .then((res) => {
                if (res.status === 204) {
                    return userId;
                }

                if (res.status === 401 || res.status === 403) {
                    logoutUser();
                    return Promise.reject();
                }

                return Promise.reject();
            })
            .then(() => {
                const previousSelection = Object.assign({}, packageSelections);
                previousSelection[userId] = selectedPackage === '__none__' ? '' : selectedPackage;
                setPackageSelections(previousSelection);

                const previousErrorStates = Object.assign({}, packageSelectionErrorStates);
                previousErrorStates[userId] = false;
                setPackageSelectionErrorStates(previousErrorStates);

                if (props.updateWinnerList) {
                    props.updateWinnerList();
                }
            })
            .catch(() => {
                const previousErrorStates = Object.assign({}, packageSelectionErrorStates);
                previousErrorStates[userId] = true;
                setPackageSelectionErrorStates(previousErrorStates);
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
                                                    <SelectContent>{getPossiblePackageMenuItems(currentWinner.id, props.numberOfMaxSubPackages)}</SelectContent>
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
