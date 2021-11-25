import { Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import { Localized } from '../Localized';
import { useContext } from 'react';
import { LocalizationContext } from '../LocalizationProvider';

export const Settings = () => {
    const localizationContext = useContext(LocalizationContext);

    return (
        <Grid container columns={12} spacing={2} justifyContent={'center'} alignItems={'center'}>
            <Grid item xs={3}>
                <Card variant="outlined">
                    <CardContent>
                        <Stack direction={'column'} spacing={1}>
                            <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                <Localized translationKey={'settings.cards.password.headline'} />
                            </Typography>
                            <TextField
                                id={'first-password-input'}
                                label={localizationContext.translate('settings.cards.password.labels.password_first')}
                                type={'password'}
                                autoComplete={'new-password'}
                                variant={'outlined'}
                            />
                            <TextField
                                id={'first-password-input'}
                                label={localizationContext.translate('settings.cards.password.labels.password_repeated')}
                                type={'password'}
                                autoComplete={'new-password'}
                                variant={'outlined'}
                            />
                            <Button variant="contained" disableElevation>
                                <Localized translationKey={'settings.cards.password.buttons.change'} />
                            </Button>
                        </Stack>
                    </CardContent>
                </Card>
            </Grid>
        </Grid>
    );
};
