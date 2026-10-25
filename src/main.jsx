import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
// Weight and optical-size axes: big headlines get the display cut
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import './index.css'
import App from './App.jsx'
import { initAppearance } from './theme.js'

initAppearance()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
