import { Card, CardContent, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LocalizedText } from '../../components/LocalizedText';
import { ChangeEvent, useContext, useState } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { API_BACKEND_URL } from '../../api';
import { PasswordChangedDialog } from '../../dialogs/PasswordChangedDialog';
import { PasswordNotChangedDialog } from '../../dialogs/PasswordNotChangedDialog';
import { PasswordStrengthMeter } from '../../components/PasswordStrengthMeter';
import { cn } from '@/lib/utils';
import zxcvbn from 'zxcvbn';

export const SettingsView = () => {
    const localizationContext = useContext(LocalizationContext);
    const [firstPassword, setFirstPassword] = useState<string>('');
    const [secondPassword, setSecondPassword] = useState<string>('');
    const [isPasswordChangedDialogOpen, setIsPasswordChangedDialogOpen] = useState<boolean>(false);
    const [isPasswordChangeFailedDialogOpen, setIsPasswordChangeFailedDialogOpen] = useState<boolean>(false);
    const [isPasswordNotEqualFirst, setIsPasswordNotEqualFirst] = useState<boolean>(false);
    const [isPasswordNotEqualSecond, setIsPasswordNotEqualSecond] = useState<boolean>(false);
    const [passwordStrength, setPasswordStrength] = useState<number>(0);

    const handleChangeOfFirstPassword = (event: ChangeEvent<HTMLInputElement>) => {
        const newPassword = event.target.value;
        setFirstPassword(newPassword);

        // Calculate password strength using zxcvbn
        const result = zxcvbn(newPassword);
        setPasswordStrength(result.score);

        // Enforce minimum strength of 2 (Fair) or minimum length of 8
        if (newPassword.length > 0 && (newPassword.length < 8 || result.score < 2)) {
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
        // ensure the passwords are long enough, strong enough, and exactly the same
        if (firstPassword.length < 8 || passwordStrength < 2 || firstPassword !== secondPassword) {
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
                    <Grid size={{ xs: 3 }}>
                        <Card variant="outlined">
                            <CardContent>
                                <div className="flex flex-col gap-4">
                                    <Typography variant={'subtitle1'} sx={{ fontWeight: 'bold', textAlign: 'left' }}>
                                        <LocalizedText translationKey={'settings.cards.password.headline'} />
                                    </Typography>
                                    <div className="space-y-2">
                                        <Label htmlFor="first-password-input">
                                            {localizationContext.translate('settings.cards.password.labels.password_first')}
                                        </Label>
                                        <Input
                                            id="first-password-input"
                                            type="password"
                                            autoComplete="new-password"
                                            onChange={handleChangeOfFirstPassword}
                                            className={cn(
                                                "w-full",
                                                isPasswordNotEqualFirst && "border-destructive focus-visible:ring-destructive"
                                            )}
                                            aria-invalid={isPasswordNotEqualFirst}
                                            aria-describedby={isPasswordNotEqualFirst ? "first-password-error" : undefined}
                                        />
                                        {isPasswordNotEqualFirst && (
                                            <p id="first-password-error" className="text-sm text-destructive" role="alert">
                                                Password must be at least 8 characters and have a strength of Fair or better
                                            </p>
                                        )}
                                    </div>
                                    <PasswordStrengthMeter password={firstPassword} />
                                    <div className="space-y-2">
                                        <Label htmlFor="second-password-input">
                                            {localizationContext.translate('settings.cards.password.labels.password_repeated')}
                                        </Label>
                                        <Input
                                            id="second-password-input"
                                            type="password"
                                            autoComplete="new-password"
                                            onChange={handleChangeOfSecondPassword}
                                            className={cn(
                                                "w-full",
                                                isPasswordNotEqualSecond && "border-destructive focus-visible:ring-destructive"
                                            )}
                                            aria-invalid={isPasswordNotEqualSecond}
                                            aria-describedby={isPasswordNotEqualSecond ? "second-password-error" : undefined}
                                        />
                                        {isPasswordNotEqualSecond && (
                                            <p id="second-password-error" className="text-sm text-destructive" role="alert">
                                                Passwords must match and be at least 8 characters
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        variant="default"
                                        onClick={changePassword}
                                        disabled={firstPassword.length < 8 || passwordStrength < 2 || firstPassword !== secondPassword}
                                        className="w-full"
                                    >
                                        <LocalizedText translationKey={'settings.cards.password.buttons.change'} />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </form>
        </>
    );
};
