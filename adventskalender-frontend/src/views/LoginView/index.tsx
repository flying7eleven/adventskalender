import { FormEvent, useRef, useState } from 'react';
import Avatar from '@mui/material/Avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Typography from '@mui/material/Typography';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthentication } from '../../hooks/useAuthentication';
import { Alert, Snackbar } from '@mui/material';
import { LocalizedText } from '../../components/LocalizedText';

interface Props {
    isDark: boolean;
}

export const LoginView = (props: Props) => {
    const navigate = useNavigate();
    const location = useLocation();
    const auth = useAuthentication();

    const state = location.state as { from: Location };
    const from = state ? state.from.pathname : '/';

    const usernameField = useRef<HTMLInputElement>(null);
    const passwordField = useRef<HTMLInputElement>(null);

    const [isSnackbarOpen, setIsSnackbarOpen] = useState<boolean>(false);
    const [isRateLimitSnackbarOpen, setIsRateLimitSnackbarOpen] = useState<boolean>(false);
    const [rateLimitMessage, setRateLimitMessage] = useState<string>('');

    const handleSnackbarClose = () => {
        setIsSnackbarOpen(false);
    };

    const handleRateLimitSnackbarClose = () => {
        setIsRateLimitSnackbarOpen(false);
    };

    const requestAuthorizationToken = (event: FormEvent) => {
        // ensure that we do not handle the actual submit event anymore
        event.preventDefault();

        // ensure error snack bars are not visible before sending the request
        setIsSnackbarOpen(false);
        setIsRateLimitSnackbarOpen(false);

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
            () => setIsSnackbarOpen(true),
            (waitTime: number) => {
                // Rate limit hit - show user how long to wait
                const waitSeconds = Math.ceil(waitTime / 1000);
                setRateLimitMessage(`Too many login attempts. Please wait ${waitSeconds} second${waitSeconds !== 1 ? 's' : ''} before trying again.`);
                setIsRateLimitSnackbarOpen(true);
            }
        );
    };

    const getCorrectImage = () => {
        if (props.isDark) {
            return 'images/loginDark.jpg';
        }
        return 'images/loginLight.jpg';
    };

    return (
        <>
            <Snackbar open={isSnackbarOpen} autoHideDuration={6000} onClose={handleSnackbarClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                <Alert onClose={handleSnackbarClose} severity="error" sx={{ width: '100%' }}>
                    <LocalizedText translationKey={'login.alerts.failed_login.message'} />
                </Alert>
            </Snackbar>
            <Snackbar open={isRateLimitSnackbarOpen} autoHideDuration={10000} onClose={handleRateLimitSnackbarClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                <Alert onClose={handleRateLimitSnackbarClose} severity="warning" sx={{ width: '100%' }}>
                    {rateLimitMessage}
                </Alert>
            </Snackbar>
            <Grid container component="main" sx={{ height: '100vh' }}>
                <Grid
                    size={{ xs: false, sm: 4, md: 7 }}
                    sx={{
                        backgroundImage: `url(${getCorrectImage()})`,
                        backgroundRepeat: 'no-repeat',
                        backgroundColor: (t) => (t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.grey[900]),
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                />
                <Grid size={{ xs: 12, sm: 8, md: 5 }} component={Paper} elevation={6} square>
                    <Box
                        sx={{
                            my: 8,
                            mx: 4,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                        }}
                    >
                        <Avatar sx={{ m: 1, bgcolor: 'secondary.main' }}>
                            <LockOutlinedIcon />
                        </Avatar>
                        <Typography component="h1" variant="h5">
                            <LocalizedText translationKey={'login.headlines.signin'} />
                        </Typography>
                        <form noValidate onSubmit={requestAuthorizationToken} className="mt-4 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="username">
                                    <LocalizedText translationKey={'login.form.username_field_label'} /> *
                                </Label>
                                <Input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    autoComplete="username"
                                    autoFocus
                                    ref={usernameField}
                                    className="w-full"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">
                                    <LocalizedText translationKey={'login.form.password_field_label'} /> *
                                </Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    ref={passwordField}
                                    className="w-full"
                                />
                            </div>
                            <Button type="submit" variant="default" className="w-full mt-6 mb-4">
                                {<LocalizedText translationKey={'login.form.sign_in_button'} />}
                            </Button>
                        </form>
                    </Box>
                </Grid>
            </Grid>
        </>
    );
};
