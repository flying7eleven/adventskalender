import { Localized } from '../Localized';
import { Avatar, Button, Card, CardContent, Divider, Paper, Stack, Typography } from '@mui/material';
import { styled } from '@mui/styles';

interface Props {
    winningDate: string;
    listOfWinner: SingleWinnerInformation[];
}

const Item = styled(Paper)(({ theme }) => ({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    ...theme.typography.body2,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    padding: theme.spacing(1),
    textAlign: 'center',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    color: theme.palette.text.secondary,
}));

const PersonItem = ({ src, name }: { src: string; name: string }) => {
    return (
        <Stack direction={'column'}>
            <Item>
                <Stack direction={'row'}>
                    <Item>
                        <Avatar src={src} />
                    </Item>
                    <Item>
                        <Stack direction={'column'}>
                            <Item>
                                <Typography>{name}</Typography>
                            </Item>
                            <Item>
                                <Button variant={'outlined'} disabled>
                                    <Localized translationKey={'calendar.cards.winners.button_remove'} />
                                </Button>
                            </Item>
                        </Stack>
                    </Item>
                </Stack>
            </Item>
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
                    <Stack direction={'column'}>
                        <Item>
                            <Stack direction={'row'}>
                                <Item>
                                    <Typography>
                                        <Localized translationKey={'calendar.cards.winners.headline'} />
                                    </Typography>
                                </Item>
                                <Item>
                                    <Typography>{props.winningDate}</Typography>
                                </Item>
                            </Stack>
                        </Item>
                        <Item>{getWinningEntries()}</Item>
                    </Stack>
                </CardContent>
            </Card>
        </>
    );
};
