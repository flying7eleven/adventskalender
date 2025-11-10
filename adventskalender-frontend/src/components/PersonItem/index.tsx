import { LocalizedText } from '../LocalizedText';
import { WinnerInformation } from '../../api';
import { useState } from 'react';
import { DeleteWinnerDialog } from '../../dialogs/DeleteWinnerDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const PersonItem = ({ winner, winningDay, updateWinnerList }: { winner: WinnerInformation; winningDay: number; numberOfMaxSubPackages: number; updateWinnerList?: () => void }) => {
    const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
    const [userToDelete, setUserToDelete] = useState<WinnerInformation>({ firstName: '', lastName: '', id: -1, presentIdentifier: '' });

    const getShortenedName = (inputName: string) => {
        const splittedName = inputName.split(' ');
        if (splittedName.length > 2) {
            return `${splittedName[0]} ${splittedName[1][0]}. ${splittedName[splittedName.length - 1]}`;
        }
        return inputName;
    };

    const hasMissingPresent = (winner: WinnerInformation) => {
        return !winner.presentIdentifier;
    };

    const handleDeleteClick = (user: WinnerInformation) => {
        return () => {
            setUserToDelete(user);
            setDeleteDialogOpen(true);
        };
    };

    return (
        <>
            <DeleteWinnerDialog isOpen={deleteDialogOpen} userToDelete={userToDelete} setDialogOpenStateFunction={setDeleteDialogOpen} updateWinnerList={updateWinnerList} />
            <div className={cn('grid grid-cols-2', hasMissingPresent(winner) && 'text-destructive')}>
                <div className="flex items-center text-left">
                    <p>{getShortenedName(`${winner.firstName} ${winner.lastName}`)}</p>
                    &nbsp;
                    <p className="font-bold">{`${winningDay}${winner.presentIdentifier ? winner.presentIdentifier : ''}`}</p>
                </div>
                <Button variant={'destructive'} className="rounded-[20px] text-xs" onClick={handleDeleteClick(winner)}>
                    <LocalizedText translationKey={'calendar.cards.winners.button_remove'} />
                </Button>
            </div>
        </>
    );
};
