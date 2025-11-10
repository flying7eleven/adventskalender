import { Card, CardContent } from '@/components/ui/card';
import { ReactElement } from 'react';
import { cn } from '@/lib/utils';

interface Props {
    headline: string;
    value: string | ReactElement;
    description: string;
    className?: string;
}

export const OutlinedCard = (props: Props) => {
    return (
        <Card className={cn('min-w-[275px]', props.className)}>
            <CardContent className="p-6">
                <p className="text-sm text-muted-foreground mb-2">{props.headline}</p>
                <div className="text-2xl font-semibold">{props.value}</div>
                <p className="mt-1.5 text-foreground">{props.description}</p>
            </CardContent>
        </Card>
    );
};
