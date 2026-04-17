import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './privacy-policy.css'
import { ModerationRulesPage } from './ModerationRulesPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ModerationRulesPage />
  </StrictMode>,
)
