import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource-variable/jetbrains-mono';
import 'uplot/dist/uPlot.min.css';
import './styles.css';
import { App } from './App';
import { store } from './store';
import { DemoSim } from '../shared/demo';
import { Capacitor } from '@capacitor/core';
import { createMobileBridge } from './platform/mobile';
import { createRemoteBridge } from './platform/remote';

// desktop (Electron preload) → phone/tablet native app → phone/tablet browser on the LAN server
if (!window.fh) {
  if (Capacitor.isNativePlatform()) window.fh = createMobileBridge();
  else if (document.querySelector('meta[name="fh-remote"]')) window.fh = createRemoteBridge();
}

if (window.fh) {
  window.fh.onPacket((p) => {
    if (store.source === 'live') store.ingest(p, performance.now() / 1000);
  });
} else {
  // Plain browser (dev/preview): drive the UI with the built-in simulator.
  const sim = new DemoSim();
  for (let i = 0; i < 60 * 95; i++) store.ingest(sim.stepPacket(1 / 60), i / 60, true);
  let t = 95;
  setInterval(() => {
    if (store.source === 'live') store.ingest(sim.stepPacket(1 / 60), (t += 1 / 60));
  }, 1000 / 60);
}

createRoot(document.getElementById('root')!).render(<App />);
