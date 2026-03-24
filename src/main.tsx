import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AdminApp from './AdminApp.tsx'
import { shouldRenderAdminApp } from './app/runtimeMode'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shouldRenderAdminApp() ? <AdminApp /> : <App />}
  </StrictMode>,
)
