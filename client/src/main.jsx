import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Global styles first, so component styles can override them.
import './styles/globals.css';
import App from './app/App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
