import { LocalizationProvider } from '../../provider/LocalizationProvider';
import { useMemo } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import English from '../../languages/en.json';
import German from '../../languages/de.json';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { RequireAuthentication } from '../RequireAuthentication';
import { AuthenticatedView } from '../../views/AuthenticatedView';
import { DashboardView } from '../../views/DashboardView';
import { CalendarView } from '../../views/CalendarView';
import { VersionView } from '../../views/VersionView';
import { SettingsView } from '../../views/SettingsView';
import { LoginView } from '../../views/LoginView';
import { Toaster } from '@/components/ui/sonner';

export const App = () => {
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
                    <Toaster position="bottom-right" />
                    <AuthenticationProvider>
                        <Routes>
                            <Route>
                                <Route
                                    path="/"
                                    element={
                                        <RequireAuthentication>
                                            <AuthenticatedView content={<DashboardView />} />
                                        </RequireAuthentication>
                                    }
                                />
                                <Route
                                    path="/calendar"
                                    element={
                                        <RequireAuthentication>
                                            <AuthenticatedView content={<CalendarView />} />
                                        </RequireAuthentication>
                                    }
                                />
                                <Route
                                    path="/version"
                                    element={
                                        <RequireAuthentication>
                                            <AuthenticatedView content={<VersionView />} />
                                        </RequireAuthentication>
                                    }
                                />
                                <Route
                                    path="/settings"
                                    element={
                                        <RequireAuthentication>
                                            <AuthenticatedView content={<SettingsView />} />
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
