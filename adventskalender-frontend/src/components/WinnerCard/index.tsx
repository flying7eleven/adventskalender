import { Localized } from '../Localized';
import { Box, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';

interface Props {
    winningDate: string;
    listOfWinner: SingleWinnerInformation[];
}

const PersonItem = ({ name }: { name: string }) => {
    const getShortenedName = (inputName: string) => {
        const splittedName = inputName.split(' ');
        if (splittedName.length > 2) {
            return `${splittedName[0]} ${splittedName[1][0]}. ${splittedName[splittedName.length - 1]}`;
        }
        return inputName;
    };

    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Typography variant={'body1'} sx={{ textAlign: 'left' }}>
                {getShortenedName(name)}
            </Typography>
            <Button variant={'outlined'} sx={{ borderRadius: '20px', fontSize: 'x-small', textAlign: 'right' }} disabled>
                <Localized translationKey={'calendar.cards.winners.button_remove'} />
            </Button>
        </Box>
    );
};

export const WinnerCard = (props: Props) => {
    const getWinningEntries = () => {
        const elements = [];
        for (let i = 0; i < props.listOfWinner.length; i++) {
            elements.push(
                <PersonItem
                    key={`person-item-${props.listOfWinner[i].first_name.toLowerCase()}-${props.listOfWinner[i].last_name.toLocaleLowerCase()}`}
                    name={`${props.listOfWinner[i].first_name} ${props.listOfWinner[i].last_name}`}
                />
            );
            if (i !== props.listOfWinner.length - 1) {
                elements.push(<Divider key={`divider-${props.listOfWinner[i].first_name.toLowerCase()}-${props.listOfWinner[i].last_name.toLocaleLowerCase()}`} variant={'middle'} />);
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
            <Card variant="outlined">
                <CardContent>
                    <Stack direction={'column'} spacing={1}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                            <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                <Localized translationKey={'calendar.cards.winners.headline'} />
                            </Typography>
                            <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'right' }}>
                                {getFormattedDate(props.winningDate)}
                            </Typography>
                        </Box>
                        {getWinningEntries()}
                    </Stack>
                </CardContent>
            </Card>
        </>
    );
};
