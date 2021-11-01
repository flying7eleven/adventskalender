import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthenticatedView } from './views/AuthenticatedView';

ReactDOM.render(
    <React.StrictMode>
        <CssBaseline />
        <AuthenticatedView />
    </React.StrictMode>,
    document.getElementById('root')
);
