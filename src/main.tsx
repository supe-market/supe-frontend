/**
 * Browser entrypoint for the Supe frontend.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthProvider } from './features/auth/AuthContext';
import './styles/global.css';

// AuthProvider owns cookie/session bootstrap for both analytics and Ask before
// the routed app renders protected screens.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
