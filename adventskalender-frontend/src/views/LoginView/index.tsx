import React, { FormEvent, useRef } from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Typography from '@mui/material/Typography';
import { API_BACKEND_URL, AccessToken } from '../../api';

interface Props {
    persistToken: (token: AccessToken) => void;
}

export const LoginView = (props: Props) => {
    const usernameField = useRef<HTMLInputElement>(null);
    const passwordField = useRef<HTMLInputElement>(null);

    const requestAuthorizationToken = (event: FormEvent) => {
        // ensure that we do not handle the actual submit event anymore
        event.preventDefault();

        // prepare the data for the authentication request
        const requestData = {
            username: usernameField?.current?.value,
            password: passwordField?.current?.value,
        };

        // try to get the token
        fetch(`${API_BACKEND_URL}/auth/token`, {
            method: 'POST',
            body: JSON.stringify(requestData),
            headers: {
                'Content-type': 'application/json; charset=UTF-8',
            },
        })
            .then((response) => response.json())
            .then((token: AccessToken) => {
                props.persistToken(token);
            });
    };

    return (
        <Grid container component="main" sx={{ height: '100vh' }}>
            <Grid
                item
                xs={false}
                sm={4}
                md={7}
                sx={{
                    backgroundImage: 'url(images/login.jpg)',
                    backgroundRepeat: 'no-repeat',
                    backgroundColor: (t) => (t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.grey[900]),
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            />
            <Grid item xs={12} sm={8} md={5} component={Paper} elevation={6} square>
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
                        Sign in
                    </Typography>
                    <Box component="form" noValidate onSubmit={requestAuthorizationToken} sx={{ mt: 1 }}>
                        <TextField margin="normal" required fullWidth id="username" label="Username" name="username" autoComplete="username" autoFocus inputRef={usernameField} />
                        <TextField margin="normal" required fullWidth name="password" label="Password" type="password" id="password" autoComplete="current-password" inputRef={passwordField} />
                        <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>
                            Sign In
                        </Button>
                    </Box>
                </Box>
            </Grid>
        </Grid>
    );
};
