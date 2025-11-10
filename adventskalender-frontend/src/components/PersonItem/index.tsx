import { LocalizedText } from '../LocalizedText';
import { Box, Typography } from '@mui/material';
import { WinnerInformation } from '../../api';
import { useState } from 'react';
import { DeleteWinnerDialog } from '../../dialogs/DeleteWinnerDialog';
import { Button } from '@/components/ui/button';

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

    const getPersonStyle = (winner: WinnerInformation) => {
        const baseStyle = {
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
        };
        if (!winner.presentIdentifier) {
            return { ...baseStyle, color: 'red' };
        }
        return baseStyle;
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
            <Box sx={getPersonStyle(winner)}>
                <div style={{ display: 'flex' }}>
                    <Typography sx={{ textAlign: 'left' }}>{getShortenedName(`${winner.firstName} ${winner.lastName}`)}</Typography>
                    &nbsp;
                    <Typography sx={{ fontWeight: 'bold' }}>{`${winningDay}${winner.presentIdentifier ? winner.presentIdentifier : ''}`}</Typography>
                </div>
                <Button variant={'destructive'} className="rounded-[20px] text-xs text-right" onClick={handleDeleteClick(winner)}>
                    <LocalizedText translationKey={'calendar.cards.winners.button_remove'} />
                </Button>
            </Box>
        </>
    );
};
