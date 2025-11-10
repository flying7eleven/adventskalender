import { FormEvent, useContext, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { LockKeyhole } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthentication } from '../../hooks/useAuthentication';
import { toast } from 'sonner';
import { LocalizedText } from '../../components/LocalizedText';
import { LocalizationContext } from '../../provider/LocalizationContext';
import { useTheme } from '../../provider/ThemeProvider';

export const LoginView = () => {
    const { theme } = useTheme();
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        if (theme === 'system') {
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setIsDark(systemPrefersDark);
        } else {
            setIsDark(theme === 'dark');
        }
    }, [theme]);
    const navigate = useNavigate();
    const location = useLocation();
    const auth = useAuthentication();
    const localizationContext = useContext(LocalizationContext);

    const state = location.state as { from: Location };
    const from = state ? state.from.pathname : '/';

    const usernameField = useRef<HTMLInputElement>(null);
    const passwordField = useRef<HTMLInputElement>(null);

    const requestAuthorizationToken = (event: FormEvent) => {
        // ensure that we do not handle the actual submit event anymore
        event.preventDefault();

        // try to authenticate against the API backend
        auth.signin(
            usernameField?.current?.value || '',
            passwordField?.current?.value || '',
            () => {
                // Send them back to the page they tried to visit when they were
                // redirected to the login page. Use { replace: true } so we don't create
                // another entry in the history stack for the login page.  This means that
                // when they get to the protected page and click the back button, they
                // won't end up back on the login page, which is also really nice for the
                // user experience.
                navigate(from, { replace: true });
            },
            () =>
                toast.error(localizationContext.translate('login.alerts.failed_login.message'), {
                    duration: 6000,
                }),
            (waitTime: number) => {
                // Rate limit hit - show user how long to wait
                const waitSeconds = Math.ceil(waitTime / 1000);
                const rateLimitMessage = `Too many login attempts. Please wait ${waitSeconds} second${waitSeconds !== 1 ? 's' : ''} before trying again.`;
                toast.warning(rateLimitMessage, {
                    duration: 10000,
                });
            }
        );
    };

    const getCorrectImage = () => {
        if (isDark) {
            return 'images/loginDark.jpg';
        }
        return 'images/loginLight.jpg';
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 h-screen">
            {/* Background image section - hidden on mobile */}
            <div
                className="hidden md:block md:col-span-7 bg-cover bg-center bg-no-repeat"
                style={{
                    backgroundImage: `url(${getCorrectImage()})`,
                    backgroundColor: isDark ? '#18181b' : '#f4f4f5',
                }}
            />

            {/* Login form section */}
            <div className="col-span-1 md:col-span-5 flex items-center justify-center p-4">
                <Card className="w-full max-w-md shadow-lg">
                    <CardContent className="p-8">
                        <div className="flex flex-col items-center mb-6">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary mb-4">
                                <LockKeyhole className="h-6 w-6 text-secondary-foreground" />
                            </div>
                            <h1 className="text-2xl font-semibold">
                                <LocalizedText translationKey={'login.headlines.signin'} />
                            </h1>
                        </div>
                        <form noValidate onSubmit={requestAuthorizationToken} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="username">
                                    <LocalizedText translationKey={'login.form.username_field_label'} /> *
                                </Label>
                                <Input id="username" name="username" type="text" required autoComplete="username" autoFocus ref={usernameField} className="w-full" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">
                                    <LocalizedText translationKey={'login.form.password_field_label'} /> *
                                </Label>
                                <Input id="password" name="password" type="password" required autoComplete="current-password" ref={passwordField} className="w-full" />
                            </div>
                            <Button type="submit" variant="default" className="w-full mt-6">
                                <LocalizedText translationKey={'login.form.sign_in_button'} />
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
