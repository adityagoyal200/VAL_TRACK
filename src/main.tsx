import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'
import { GrainOverlay } from './components/grain-overlay'
import { CrosshairCursor } from './components/crosshair-cursor'
import { BootIntro } from './components/boot-intro'
import { Toaster } from './components/toaster'

// Code-split the WebGL backdrop (three.js) out of the critical path.
const TacticalBackground = lazy(() =>
  import('./components/tactical-background').then((m) => ({
    default: m.TacticalBackground,
  })),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <Suspense fallback={null}>
        <TacticalBackground />
      </Suspense>
      <div className="relative z-10">
        <AppRouter />
      </div>
      <GrainOverlay />
      <CrosshairCursor />
      <BootIntro />
      <Toaster />
    </AppProviders>
  </StrictMode>,
)
