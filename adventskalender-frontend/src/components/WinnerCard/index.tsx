import { LocalizedText } from '../LocalizedText';
import { Box, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { WinnerInformation } from '../../api';
import { useEffect, useState } from 'react';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { PersonItem } from '../PersonItem';
import { EditWinnerDialog } from '../../dialogs/EditWinnerDialog';

interface Props {
    winningDate: string;
    listOfWinner: WinnerInformation[];
    updateWinnerList?: () => void;
    numberOfMaxSubPackages: number;
}

export const WinnerCard = (props: Props) => {
    const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
    const [packageSelections, setPackageSelections] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        props.listOfWinner.forEach((winner) => {
            let oldPackageSelections = Object.assign({}, packageSelections);
            oldPackageSelections[winner.id] = winner.presentIdentifier ? winner.presentIdentifier : '';
            setPackageSelections(oldPackageSelections);
        });
    }, [props.listOfWinner]);

    const handleEditClick = () => {
        setEditDialogOpen(true);
    };

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
            <EditWinnerDialog
                listOfWinner={props.listOfWinner}
                isOpen={editDialogOpen}
                setDialogOpenStateFunction={setEditDialogOpen}
                numberOfMaxSubPackages={props.numberOfMaxSubPackages}
                packageSelections={packageSelections}
            />
            <Card variant="outlined">
                <CardContent>
                    <Stack direction={'column'} spacing={1}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 0.2fr' }}>
                            <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                <LocalizedText translationKey={'calendar.cards.winners.headline'} />
                            </Typography>
                            <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                                {getFormattedDate(props.winningDate)}
                            </Typography>
                            {import.meta.env.DEV && (
                                <Button variant={'outlined'} sx={{ borderRadius: '20px', fontSize: 'x-small', textAlign: 'right' }} onClick={handleEditClick}>
                                    <EditNoteIcon />
                                </Button>
                            )}
                        </Box>
                        {getWinningEntries()}
                    </Stack>
                    <Divider />
                </CardContent>
            </Card>
        </>
    );
};
