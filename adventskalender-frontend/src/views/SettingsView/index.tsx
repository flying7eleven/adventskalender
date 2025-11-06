import { Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import { LocalizedText } from '../../components/LocalizedText';
import { ChangeEvent, useContext, useState } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { API_BACKEND_URL } from '../../api';
import { PasswordChangedDialog } from '../../dialogs/PasswordChangedDialog';
import { PasswordNotChangedDialog } from '../../dialogs/PasswordNotChangedDialog';

export const SettingsView = () => {
    const localizationContext = useContext(LocalizationContext);
    const [firstPassword, setFirstPassword] = useState<string>('');
    const [secondPassword, setSecondPassword] = useState<string>('');
    const [isPasswordChangedDialogOpen, setIsPasswordChangedDialogOpen] = useState<boolean>(false);
    const [isPasswordChangeFailedDialogOpen, setIsPasswordChangeFailedDialogOpen] = useState<boolean>(false);
    const [isPasswordNotEqualFirst, setIsPasswordNotEqualFirst] = useState<boolean>(false);
    const [isPasswordNotEqualSecond, setIsPasswordNotEqualSecond] = useState<boolean>(false);

    const handleChangeOfFirstPassword = (event: ChangeEvent<HTMLInputElement>) => {
        setFirstPassword(event.target.value);
        if (event.target.value.length < 8) {
            setIsPasswordNotEqualFirst(true);
        } else {
            setIsPasswordNotEqualFirst(false);
        }
    };

    const handleChangeOfSecondPassword = (event: ChangeEvent<HTMLInputElement>) => {
        setSecondPassword(event.target.value);
        if (event.target.value.length < 8 || firstPassword !== event.target.value) {
            setIsPasswordNotEqualSecond(true);
        } else {
            setIsPasswordNotEqualSecond(false);
        }
    };

    const changePassword = () => {
        // ensure the passwords are long enough and also exactly the same
        if (firstPassword.length < 8 || firstPassword !== secondPassword) {
            return;
        }

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
                'Content-type': 'application/json; charset=UTF-8',
            },
            credentials: 'include',
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

    return (
        <>
            <PasswordChangedDialog isOpen={isPasswordChangedDialogOpen} setDialogOpenStateFunction={setIsPasswordChangedDialogOpen} />
            <PasswordNotChangedDialog isOpen={isPasswordChangeFailedDialogOpen} setDialogOpenStateFunction={setIsPasswordChangeFailedDialogOpen} />
            <form>
                <Grid container columns={12} spacing={2} justifyContent={'center'} alignItems={'center'}>
                    <Grid item xs={3}>
                        <Card variant="outlined">
                            <CardContent>
                                <Stack direction={'column'} spacing={2}>
                                    <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                        <LocalizedText translationKey={'settings.cards.password.headline'} />
                                    </Typography>
                                    <TextField
                                        id={'first-password-input'}
                                        label={localizationContext.translate('settings.cards.password.labels.password_first')}
                                        type={'password'}
                                        autoComplete={'new-password'}
                                        variant={'outlined'}
                                        onChange={handleChangeOfFirstPassword}
                                        error={isPasswordNotEqualFirst}
                                    />
                                    <TextField
                                        id={'second-password-input'}
                                        label={localizationContext.translate('settings.cards.password.labels.password_repeated')}
                                        type={'password'}
                                        autoComplete={'new-password'}
                                        variant={'outlined'}
                                        onChange={handleChangeOfSecondPassword}
                                        error={isPasswordNotEqualSecond}
                                    />
                                    <Button variant="contained" disableElevation onClick={changePassword}>
                                        <LocalizedText translationKey={'settings.cards.password.buttons.change'} />
                                    </Button>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </form>
        </>
    );
};
