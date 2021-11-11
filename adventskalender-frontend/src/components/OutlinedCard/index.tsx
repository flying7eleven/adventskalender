import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { ReactElement } from 'react';

interface Props {
    headline: string;
    value: string | ReactElement;
    description: string;
}

export const OutlinedCard = (props: Props) => {
    return (
        <Box sx={{ minWidth: 275 }}>
            <Card variant="outlined">
                {' '}
                <CardContent>
                    <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
                        {props.headline}
                    </Typography>
                    <Typography variant="h3" component="div">
                        {props.value}
                    </Typography>
                    <Typography sx={{ mb: 1.5 }} color="text.primary">
                        {props.description}
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
};
