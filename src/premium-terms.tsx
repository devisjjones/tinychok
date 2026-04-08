import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './privacy-policy.css'
import { PremiumTermsPage } from './PremiumTermsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PremiumTermsPage />
  </StrictMode>,
)
