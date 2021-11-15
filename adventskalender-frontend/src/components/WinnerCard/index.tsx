import { Localized } from '../Localized';
import { Avatar, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';

interface Props {
    winningDate: string;
    listOfWinner: SingleWinnerInformation[];
}

const PersonItem = ({ src, name }: { src: string; name: string }) => {
    return (
        <Stack direction={'column'}>
            <Stack direction={'row'} spacing={1}>
                <Avatar src={src} />
                <Stack direction={'column'} spacing={1}>
                    <Typography>{name}</Typography>
                    <Button variant={'outlined'} disabled>
                        <Localized translationKey={'calendar.cards.winners.button_remove'} />
                    </Button>
                </Stack>
            </Stack>
        </Stack>
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
                    src={'images/christmasTree.jpg'}
                />
            );
            if (i !== props.listOfWinner.length - 1) {
                elements.push(<Divider key={`divider-${props.listOfWinner[i].first_name.toLowerCase()}-${props.listOfWinner[i].last_name.toLocaleLowerCase()}`} variant={'middle'} />);
            }
        }
        return elements;
    };

    return (
        <>
            <Card variant="outlined">
                <CardContent>
                    <Stack direction={'column'} spacing={1}>
                        <Typography component={'h1'}>
                            <Localized translationKey={'calendar.cards.winners.headline'} placeholder={props.winningDate} />
                        </Typography>
                        {getWinningEntries()}
                    </Stack>
                </CardContent>
            </Card>
        </>
    );
};
