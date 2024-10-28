import { StrictMode } from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import { App } from './components/App';

// determine the users locale and create a theme we want to use in the whole app

ReactDOM.render(
    <StrictMode>
        <App />
    </StrictMode>,
    document.getElementById('root')
);
