import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import { captureAdminRecoveryCallback } from './lib/auth/adminRecovery.js';
import './styles/index.css';

const recoveryCallback = captureAdminRecoveryCallback(window.location, window.history);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App recoveryCallback={recoveryCallback} />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
