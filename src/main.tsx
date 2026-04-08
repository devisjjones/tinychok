import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { shouldRenderAdminApp } from './app/runtimeMode'

const App = lazy(() => import('./App.tsx'))
const AdminApp = lazy(() => import('./AdminApp.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      {shouldRenderAdminApp() ? <AdminApp /> : <App />}
    </Suspense>
  </StrictMode>,
)
