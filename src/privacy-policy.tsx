import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './privacy-policy.css'
import { PrivacyPolicyPage } from './PrivacyPolicyPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivacyPolicyPage />
  </StrictMode>,
)
