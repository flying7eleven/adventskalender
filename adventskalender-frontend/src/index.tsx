import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import { AuthenticatedView } from './views/AuthenticatedView';

ReactDOM.render(
    <React.StrictMode>
        <AuthenticatedView />
    </React.StrictMode>,
    document.getElementById('root')
);
