import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: '#0c1426',
          color: '#e2e8f0',
          border: '1px solid #1a2744',
          fontFamily: 'monospace',
          fontSize: '13px',
        },
        success: { iconTheme: { primary: '#10b981', secondary: '#0c1426' } },
        error:   { iconTheme: { primary: '#ef4444', secondary: '#0c1426' } },
      }}
    />
  </React.StrictMode>
);

reportWebVitals();