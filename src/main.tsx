import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './hooks/useToast.tsx'

// ToastProvider sits above App so any component in the tree (including
// App itself, which calls useToast for sign-out/profile-load failures)
// can show toasts. ConfirmProvider is mounted inside App because only
// dashboard/auth routes need it — toasts are app-wide.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
