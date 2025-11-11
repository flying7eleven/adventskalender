import { LocalizedText } from '../LocalizedText';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { WinnerInformation } from '../../api';
import { useEffect, useState } from 'react';
import { Edit } from 'lucide-react';
import { PersonItem } from '../PersonItem';
import { EditWinnerDialog } from '../../dialogs/EditWinnerDialog';
import { Button } from '@/components/ui/button';

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
        const newPackageSelections: { [key: string]: string } = {};
        props.listOfWinner.forEach((winner) => {
            newPackageSelections[winner.id] = winner.presentIdentifier ? winner.presentIdentifier : '';
        });
        setPackageSelections(newPackageSelections);
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
                elements.push(<Separator key={`divider-${sortedWinners[i].id}`} className="my-2" />);
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

    // Determine card variant based on date and winner status
    const getCardVariant = () => {
        const today = new Date();
        const cardDate = new Date(props.winningDate);

        // Check if this is today's date
        const isToday = today.getFullYear() === cardDate.getFullYear() && today.getMonth() === cardDate.getMonth() && today.getDate() === cardDate.getDate();

        // If winners exist, use success variant; if today, use warning variant
        if (props.listOfWinner.length > 0) {
            return 'glass-success';
        } else if (isToday) {
            return 'glass-warning';
        }

        return 'glass';
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
            <Card variant={getCardVariant()} className="glass-hover">
                <CardContent className="p-6">
                    <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-[1.3fr_1.3fr_0.2fr] items-center">
                            <p className="text-sm font-medium text-left">
                                <LocalizedText translationKey={'calendar.cards.winners.headline'} />
                            </p>
                            <p className="text-sm font-medium text-center">{getFormattedDate(props.winningDate)}</p>
                            {import.meta.env.DEV && (
                                <Button variant={'outline'} size="icon" className="rounded-full h-8 w-8 ml-auto" onClick={handleEditClick}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        {getWinningEntries()}
                    </div>
                    <Separator className="mt-4" />
                </CardContent>
            </Card>
        </>
    );
};
