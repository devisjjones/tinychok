import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './privacy-policy.css'
import { AvatarUploadRulesPage } from './AvatarUploadRulesPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AvatarUploadRulesPage />
  </StrictMode>,
)
