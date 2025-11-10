import { LocalizationProvider } from '../../provider/LocalizationProvider';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import English from '../../languages/en.json';
import German from '../../languages/de.json';
import { AuthenticationProvider } from '../../provider/AuthenticationProvider';
import { ThemeProvider } from '../../provider/ThemeProvider';
import { RequireAuthentication } from '../RequireAuthentication';
import { AuthenticatedView } from '../../views/AuthenticatedView';
import { DashboardView } from '../../views/DashboardView';
import { CalendarView } from '../../views/CalendarView';
import { VersionView } from '../../views/VersionView';
import { SettingsView } from '../../views/SettingsView';
import { LoginView } from '../../views/LoginView';
import { Toaster } from '@/components/ui/sonner';

export const App = () => {
    return (
        <BrowserRouter>
            <ThemeProvider defaultTheme="system" storageKey="adventskalender-ui-theme">
                <LocalizationProvider resources={{ english: English, german: German }}>
                    <AuthenticationProvider>
                        <Toaster position="bottom-right" />
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
                                <Route path="/login" element={<LoginView />} />
                            </Route>
                        </Routes>
                    </AuthenticationProvider>
                </LocalizationProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
};
