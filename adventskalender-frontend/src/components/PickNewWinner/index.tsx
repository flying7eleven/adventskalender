import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface Props {
    onRequestWinner: () => void;
    isLoadingNewWinner: boolean;
    label: string;
    isEnabled: boolean;
}

export const PickNewWinner = (props: Props) => {
    return (
        <Button disabled={!props.isEnabled || props.isLoadingNewWinner} variant="default" onClick={props.onRequestWinner}>
            {props.isLoadingNewWinner && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {props.label}
        </Button>
    );
};
