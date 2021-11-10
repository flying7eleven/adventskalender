import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import useMediaQuery from '@mui/material/useMediaQuery';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthenticationProvider } from './components/AuthenticationProvider';
import { LoginView } from './views/LoginView';
import { RequireAuthentication } from './components/RequireAuthentication';
import { AuthenticatedView } from './views/AuthenticatedView';
import { LocalizationProvider } from './components/LocalizationProvider';
import English from './languages/en.json';
import German from './languages/de.json';

const App = () => {
    const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
    const theme = useMemo(
        () =>
            createTheme({
                palette: {
                    mode: prefersDarkMode ? 'dark' : 'light',
                },
            }),
        [prefersDarkMode]
    );

    return (
        <BrowserRouter>
            <ThemeProvider theme={theme}>
                <LocalizationProvider resources={{ english: English, german: German }}>
                    <CssBaseline />
                    <AuthenticationProvider>
                        <Routes>
                            <Route>
                                <Route
                                    path="/"
                                    element={
                                        <RequireAuthentication>
                                            <AuthenticatedView />
                                        </RequireAuthentication>
                                    }
                                />
                                <Route path="/login" element={<LoginView />} />
                            </Route>
                        </Routes>
                    </AuthenticationProvider>
                </LocalizationProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
};

// determine the users locale and create a theme we want to use in the whole app

ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    document.getElementById('root')
);
