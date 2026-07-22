import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import App from './App'
import { ToastViewport } from './components/shared/ToastViewport'
import './styles/index.scss'

createRoot(document.getElementById('root')!).render(<StrictMode><App /><ToastViewport /></StrictMode>)
