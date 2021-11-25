import { StrictMode, useMemo } from 'react';
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
import { Dashboard } from './components/Dashboard';
import { Calendar } from './components/Calendar';
import { Version } from './components/Version';
import { Settings } from './components/Settings';

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
                                            <AuthenticatedView content={<Dashboard />} />
                                        </RequireAuthentication>
                                    }
                                />
                                <Route
                                    path="/calendar"
                                    element={
                                        <RequireAuthentication>
                                            <AuthenticatedView content={<Calendar />} />
                                        </RequireAuthentication>
                                    }
                                />
                                <Route
                                    path="/version"
                                    element={
                                        <RequireAuthentication>
                                            <AuthenticatedView content={<Version />} />
                                        </RequireAuthentication>
                                    }
                                />
                                <Route
                                    path="/settings"
                                    element={
                                        <RequireAuthentication>
                                            <AuthenticatedView content={<Settings />} />
                                        </RequireAuthentication>
                                    }
                                />
                                <Route path="/login" element={<LoginView isDark={prefersDarkMode} />} />
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
    <StrictMode>
        <App />
    </StrictMode>,
    document.getElementById('root')
);
