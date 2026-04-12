import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './privacy-policy.css'
import { RefundPolicyPage } from './RefundPolicyPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RefundPolicyPage />
  </StrictMode>,
)
