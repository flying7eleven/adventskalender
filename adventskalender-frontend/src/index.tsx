import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthenticatedView } from './views/AuthenticatedView';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { LoginView } from './views/LoginView';

const theme = createTheme();

ReactDOM.render(
    <React.StrictMode>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <LoginView />
        </ThemeProvider>
    </React.StrictMode>,
    document.getElementById('root')
);
