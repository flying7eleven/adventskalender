import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthenticationProvider } from './components/AuthenticationProvider';
import { LoginView } from './views/LoginView';
import { RequireAuthentication } from './components/RequireAuthentication';
import { AuthenticatedView } from './views/AuthenticatedView';
import { LocalizationProvider } from './components/LocalizationProvider';
import English from './languages/en.json';
import German from './languages/en.json';

// determine the users locale and create a theme we want to use in the whole app
const theme = createTheme();

ReactDOM.render(
    <React.StrictMode>
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
    </React.StrictMode>,
    document.getElementById('root')
);
