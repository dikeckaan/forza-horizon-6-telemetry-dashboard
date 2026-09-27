# capacitor-udp-telemetry

Tiny Capacitor 8 plugin used by the mobile build of the dashboard: binds a UDP
socket and emits every datagram (Forza "Data Out") to JavaScript as base64.

```ts
import { UdpTelemetry } from 'capacitor-udp-telemetry';
await UdpTelemetry.addListener('packet', ({ data, from }) => { /* … */ });
await UdpTelemetry.start({ port: 20440 });
```

Android: `DatagramSocket` on a worker thread. iOS: Network framework `NWListener`
(the app declares `NSLocalNetworkUsageDescription`).
