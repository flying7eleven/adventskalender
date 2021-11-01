import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthenticatedView } from './views/AuthenticatedView';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { LoginView } from './views/LoginView';
import { useToken } from './hooks/useToken';

const theme = createTheme();

const App = () => {
    const { isTokenValid, storeNewToken } = useToken();

    // if we are not authenticated, show the login view
    if (!isTokenValid()) {
        return <LoginView persistToken={storeNewToken} />;
    }

    // if we are authenticated, we can show the app as expected
    return <AuthenticatedView />;
};

ReactDOM.render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
        </ThemeProvider>
    </React.StrictMode>,
    document.getElementById('root')
);
