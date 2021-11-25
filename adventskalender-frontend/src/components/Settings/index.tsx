import { Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import { Localized } from '../Localized';
import { ChangeEvent, useContext, useState } from 'react';
import { LocalizationContext } from '../LocalizationProvider';
import { API_BACKEND_URL } from '../../api';
import { useAuthentication } from '../../hooks/useAuthentication';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';

export const Settings = () => {
    const localizationContext = useContext(LocalizationContext);
    const auth = useAuthentication();
    const [firstPassword, setFirstPassword] = useState<string>('');
    const [secondPassword, setSecondPassword] = useState<string>('');
    const [isPasswordChangedDialogOpen, setIsPasswordChangedDialogOpen] = useState<boolean>(false);
    const [isPasswordChangeFailedDialogOpen, setIsPasswordChangeFailedDialogOpen] = useState<boolean>(false);

    const handleChangeOfFirstPassword = (event: ChangeEvent<HTMLInputElement>) => {
        setFirstPassword(event.target.value);
    };

    const handleChangeOfSecondPassword = (event: ChangeEvent<HTMLInputElement>) => {
        setSecondPassword(event.target.value);
    };

    const changePassword = () => {
        // TODO: are password fields filled with long enough password

        // combine the password information into a single struct
        const requestData = {
            first_time: firstPassword,
            second_time: secondPassword,
        };

        // request settings a new password
        fetch(`${API_BACKEND_URL}/auth/password`, {
            method: 'PUT',
            body: JSON.stringify(requestData),
            headers: {
                Authorization: `Bearer ${auth.token.accessToken}`,
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((response) => {
                if (response.status !== 204) {
                    return Promise.reject();
                }
                return response;
            })
            .then(() => {
                setIsPasswordChangedDialogOpen(true);
            })
            .catch(() => {
                setIsPasswordChangeFailedDialogOpen(true);
            });
    };

    const handlePasswordChangeDialogClose = () => {
        setIsPasswordChangedDialogOpen(false);
    };

    const handlePasswordChangeFailedDialogClose = () => {
        setIsPasswordChangeFailedDialogOpen(false);
    };

    return (
        <>
            <Dialog open={isPasswordChangedDialogOpen} onClose={handlePasswordChangeDialogClose} aria-labelledby="alert-dialog-title-successful" aria-describedby="alert-dialog-description-successful">
                <DialogTitle id="alert-dialog-title-successful">
                    <Localized translationKey={'settings.dialogs.password_change_successful.title'} />
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description-successful">
                        <Localized translationKey={'settings.dialogs.password_change_successful.text'} />
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handlePasswordChangeDialogClose} autoFocus>
                        <Localized translationKey={'settings.dialogs.password_change_successful.accept_button'} />
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog
                open={isPasswordChangeFailedDialogOpen}
                onClose={handlePasswordChangeFailedDialogClose}
                aria-labelledby="alert-dialog-title-failed"
                aria-describedby="alert-dialog-description-failed"
            >
                <DialogTitle id="alert-dialog-title-failed">
                    <Localized translationKey={'settings.dialogs.password_change_failed.title'} />
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description-failed">
                        <Localized translationKey={'settings.dialogs.password_change_failed.text'} />
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handlePasswordChangeFailedDialogClose} autoFocus>
                        <Localized translationKey={'settings.dialogs.password_change_failed.accept_button'} />
                    </Button>
                </DialogActions>
            </Dialog>
            <Grid container columns={12} spacing={2} justifyContent={'center'} alignItems={'center'}>
                <Grid item xs={3}>
                    <Card variant="outlined">
                        <CardContent>
                            <Stack direction={'column'} spacing={2}>
                                <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                    <Localized translationKey={'settings.cards.password.headline'} />
                                </Typography>
                                <TextField
                                    id={'first-password-input'}
                                    label={localizationContext.translate('settings.cards.password.labels.password_first')}
                                    type={'password'}
                                    autoComplete={'new-password'}
                                    variant={'outlined'}
                                    onChange={handleChangeOfFirstPassword}
                                />
                                <TextField
                                    id={'first-password-input'}
                                    label={localizationContext.translate('settings.cards.password.labels.password_repeated')}
                                    type={'password'}
                                    autoComplete={'new-password'}
                                    variant={'outlined'}
                                    onChange={handleChangeOfSecondPassword}
                                />
                                <Button variant="contained" disableElevation onClick={changePassword}>
                                    <Localized translationKey={'settings.cards.password.buttons.change'} />
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </>
    );
};
