import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './i18n/index.js';
import './styles/tokens.css';
import './styles/global.css';
import './styles/kiosk.css';
import './styles/admin.css';
import './styles/staff.css';
import './styles/premium-light.css';
import './styles/print.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
