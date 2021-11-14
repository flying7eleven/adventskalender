import cx from 'clsx';
import Avatar from '@material-ui/core/Avatar';
import Button from '@material-ui/core/Button';
import Divider from '@material-ui/core/Divider';
import { makeStyles } from '@material-ui/core/styles';
import { Column, Row, Item } from '@mui-treasury/components/flex';
import { useDynamicAvatarStyles } from '@mui-treasury/styles/avatar/dynamic';
import { Localized } from '../Localized';

interface Props {
    winningDate: string;
    listOfWinner: SingleWinnerInformation[];
}

const usePersonStyles = makeStyles(() => ({
    text: {
        fontFamily: 'Barlow, san-serif',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
    },
    name: {
        fontWeight: 600,
        fontSize: '1rem',
        color: '#122740',
    },
    caption: {
        fontSize: '0.875rem',
        color: '#758392',
        marginTop: -4,
    },
    btn: {
        borderRadius: 20,
        padding: '0.125rem 0.75rem',
        borderColor: '#becddc',
        fontSize: '0.75rem',
    },
}));

const PersonItem = ({ src, name }: { src: string; name: string }) => {
    const avatarStyles = useDynamicAvatarStyles({ size: 56 });
    const styles = usePersonStyles();
    return (
        <Row gap={2} p={2.5}>
            <Item>
                <Avatar classes={avatarStyles} src={src} />
            </Item>
            <Row wrap grow gap={0.5} minWidth={0}>
                <Item grow minWidth={0}>
                    <div className={cx(styles.name, styles.text)}>{name}...</div>
                    <div className={cx(styles.caption, styles.text)}>
                        ...
                        <Localized translationKey={'calendar.cards.winners.description'} />
                    </div>
                </Item>
                <Item position={'middle'}>
                    <Button className={styles.btn} variant={'outlined'} disabled>
                        <Localized translationKey={'calendar.cards.winners.button_remove'} />
                    </Button>
                </Item>
            </Row>
        </Row>
    );
};

const useStyles = makeStyles(() => ({
    card: {
        width: '100%',
        borderRadius: 16,
        boxShadow: '0 8px 16px 0 #BDC9D7',
        overflow: 'hidden',
    },
    header: {
        fontFamily: 'Barlow, san-serif',
        backgroundColor: '#fff',
    },
    headline: {
        color: '#122740',
        fontSize: '1.25rem',
        fontWeight: 600,
    },
    link: {
        color: '#2281bb',
        padding: '0 0.25rem',
        fontSize: '0.875rem',
    },
    actions: {
        color: '#BDC9D7',
    },
    divider: {
        backgroundColor: '#d9e2ee',
        margin: '0 20px',
    },
}));

export const WinnerCard = (props: Props) => {
    const styles = useStyles();

    const getWinningEntries = () => {
        const elements = [];
        for (let i = 0; i < props.listOfWinner.length; i++) {
            elements.push(<PersonItem name={`${props.listOfWinner[i].first_name} ${props.listOfWinner[i].last_name}`} src={'images/christmasTree.jpg'} />);
            if (i !== props.listOfWinner.length - 1) {
                elements.push(<Divider variant={'middle'} className={styles.divider} />);
            }
        }
        return elements;
    };

    return (
        <>
            <Column p={0} gap={0} className={styles.card}>
                <Row wrap p={2} alignItems={'baseline'} className={styles.header}>
                    <Item stretched className={styles.headline}>
                        <Localized translationKey={'calendar.cards.winners.headline'} />
                    </Item>
                    <Item className={styles.actions}>{props.winningDate}</Item>
                </Row>
                {getWinningEntries()}
            </Column>
        </>
    );
};
