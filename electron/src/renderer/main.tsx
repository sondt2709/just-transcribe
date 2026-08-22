import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { OverlayView } from './components/OverlayView'
import './assets/main.css'

const isOverlay = window.location.hash === '#overlay'

// Overlay window must keep a transparent body; all other windows are dark
if (!isOverlay) document.body.classList.add('bg-neutral-950')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOverlay ? <OverlayView /> : <App />}
  </React.StrictMode>
)
