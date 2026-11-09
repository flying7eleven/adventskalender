import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LocalizedText } from '../../components/LocalizedText';
import { ChangeEvent, FormEvent, useContext, useRef, useState } from 'react';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { API_BACKEND_URL } from '../../api';
import { PasswordChangedDialog } from '../../dialogs/PasswordChangedDialog';
import { PasswordNotChangedDialog } from '../../dialogs/PasswordNotChangedDialog';
import { PasswordStrengthMeter } from '../../components/PasswordStrengthMeter';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type PasswordChangeRejectReason = 'wrong_current_password' | 'passwords_do_not_match' | 'password_too_short' | 'password_too_weak';

const isPasswordChangeRejectReason = (reason: unknown): reason is PasswordChangeRejectReason => {
    return reason === 'wrong_current_password' || reason === 'passwords_do_not_match' || reason === 'password_too_short' || reason === 'password_too_weak';
};

const MINIMUM_PASSWORD_LENGTH = 8;

const isTooShort = (password: string) => password.length < MINIMUM_PASSWORD_LENGTH;

export const SettingsView = () => {
    const localizationContext = useContext(LocalizationContext);
    const [currentPassword, setCurrentPassword] = useState<string>('');
    const [firstPassword, setFirstPassword] = useState<string>('');
    const [secondPassword, setSecondPassword] = useState<string>('');
    const [isPasswordChangedDialogOpen, setIsPasswordChangedDialogOpen] = useState<boolean>(false);
    const [isPasswordChangeFailedDialogOpen, setIsPasswordChangeFailedDialogOpen] = useState<boolean>(false);
    const [isPasswordNotEqualFirst, setIsPasswordNotEqualFirst] = useState<boolean>(false);
    const [isPasswordNotEqualSecond, setIsPasswordNotEqualSecond] = useState<boolean>(false);
    const [passwordStrength, setPasswordStrength] = useState<number | null>(null);
    const latestFirstPassword = useRef<string>('');

    const handleCurrentPasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
        setCurrentPassword(event.target.value);
    };

    const handleChangeOfFirstPassword = (event: ChangeEvent<HTMLInputElement>) => {
        const newPassword = event.target.value;
        latestFirstPassword.current = newPassword;
        setFirstPassword(newPassword);
        if (!newPassword) {
            setPasswordStrength(null);
            setIsPasswordNotEqualFirst(false);
            return;
        }

        // loaded on demand to keep the large zxcvbn dictionary out of the entry bundle
        import('zxcvbn')
            .then(({ default: zxcvbn }) => {
                if (latestFirstPassword.current !== newPassword) {
                    return;
                }
                const result = zxcvbn(newPassword);
                setPasswordStrength(result.score);
                setIsPasswordNotEqualFirst(isTooShort(newPassword) || result.score < 2);
            })
            .catch(() => {
                if (latestFirstPassword.current !== newPassword) {
                    return;
                }
                // without a strength estimation we cannot give the user feedback, the backend still validates it
                setIsPasswordNotEqualFirst(isTooShort(newPassword));
                setPasswordStrength(0);
            });
    };

    const handleChangeOfSecondPassword = (event: ChangeEvent<HTMLInputElement>) => {
        setSecondPassword(event.target.value);
        setIsPasswordNotEqualSecond(isTooShort(event.target.value) || firstPassword !== event.target.value);
    };

    const changePassword = (event: FormEvent<HTMLFormElement>) => {
        // ensure that we do not handle the actual submit event anymore
        event.preventDefault();

        // ensure the passwords are long enough, strong enough, and exactly the same
        if (isTooShort(firstPassword) || (passwordStrength ?? 0) < 2 || firstPassword !== secondPassword) {
            return;
        }

        // combine the password information into a single struct
        const requestData = {
            current_password: currentPassword,
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
                if (response.status === 204) {
                    setIsPasswordChangedDialogOpen(true);
                    return;
                }

                // the backend rejected the new password with a reason we can show to the user
                if (response.status === 422) {
                    return response
                        .json()
                        .catch(() => undefined)
                        .then((body) => {
                            const reason = isPasswordChangeRejectReason(body?.reason) ? body.reason : undefined;
                            const localizedReason = reason
                                ? localizationContext.translate(`settings.cards.password.errors.${reason}`)
                                : localizationContext.translate('settings.cards.password.errors.unknown');
                            toast.error(localizedReason, {
                                duration: 6000,
                            });
                        });
                }

                if (response.status === 429) {
                    const retryAfterSeconds = response.headers.get('Retry-After') ?? '0';
                    toast.error(localizationContext.translate('settings.cards.password.errors.rate_limited').replace('{0}', retryAfterSeconds), {
                        duration: 6000,
                    });
                    return;
                }

                // in all other cases, we expect that there was an unknown error. We indicate that to the user by
                // showing a proper error dialog
                setIsPasswordChangeFailedDialogOpen(true);
            })
            .catch(() => {
                setIsPasswordChangeFailedDialogOpen(true);
            });
    };

    return (
        <>
            <PasswordChangedDialog isOpen={isPasswordChangedDialogOpen} setDialogOpenStateFunction={setIsPasswordChangedDialogOpen} />
            <PasswordNotChangedDialog isOpen={isPasswordChangeFailedDialogOpen} setDialogOpenStateFunction={setIsPasswordChangeFailedDialogOpen} />
            <form onSubmit={changePassword}>
                <div className="flex justify-center items-center p-4">
                    <Card className="w-full max-w-md">
                        <CardContent className="p-6">
                            <div className="flex flex-col gap-4">
                                <p className="text-sm font-medium text-left">
                                    <LocalizedText translationKey={'settings.cards.password.headline'} />
                                </p>
                                <div className="space-y-2">
                                    <Label htmlFor="current-password-input">{localizationContext.translate('settings.cards.password.labels.password_current')}</Label>
                                    <Input id="current-password-input" type="password" autoComplete="current-password" onChange={handleCurrentPasswordChange} required className="w-full" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="first-password-input">{localizationContext.translate('settings.cards.password.labels.password_first')}</Label>
                                    <Input
                                        id="first-password-input"
                                        type="password"
                                        autoComplete="new-password"
                                        onChange={handleChangeOfFirstPassword}
                                        className={cn('w-full', isPasswordNotEqualFirst && 'border-destructive focus-visible:ring-destructive')}
                                        aria-invalid={isPasswordNotEqualFirst}
                                        aria-describedby={isPasswordNotEqualFirst ? 'first-password-error' : undefined}
                                    />
                                    {isPasswordNotEqualFirst && (
                                        <p id="first-password-error" className="text-sm text-destructive" role="alert">
                                            <LocalizedText translationKey={'settings.cards.password.errors.password_too_weak'} />
                                        </p>
                                    )}
                                </div>
                                <PasswordStrengthMeter score={passwordStrength} />
                                <div className="space-y-2">
                                    <Label htmlFor="second-password-input">{localizationContext.translate('settings.cards.password.labels.password_repeated')}</Label>
                                    <Input
                                        id="second-password-input"
                                        type="password"
                                        autoComplete="new-password"
                                        onChange={handleChangeOfSecondPassword}
                                        className={cn('w-full', isPasswordNotEqualSecond && 'border-destructive focus-visible:ring-destructive')}
                                        aria-invalid={isPasswordNotEqualSecond}
                                        aria-describedby={isPasswordNotEqualSecond ? 'second-password-error' : undefined}
                                    />
                                    {isPasswordNotEqualSecond && (
                                        <p id="second-password-error" className="text-sm text-destructive" role="alert">
                                            <LocalizedText translationKey={'settings.cards.password.errors.passwords_do_not_match'} />
                                        </p>
                                    )}
                                </div>
                                <Button type="submit" variant="default" disabled={isTooShort(firstPassword) || (passwordStrength ?? 0) < 2 || firstPassword !== secondPassword} className="w-full">
                                    <LocalizedText translationKey={'settings.cards.password.buttons.change'} />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </form>
        </>
    );
};
