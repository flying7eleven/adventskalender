import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './components/App';

// determine the users locale and create a theme we want to use in the whole app

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Failed to find the root element');
}

const root = createRoot(rootElement);
root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
