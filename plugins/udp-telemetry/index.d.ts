import type { PluginListenerHandle } from '@capacitor/core';

export interface UdpPacketEvent {
  /** raw datagram, base64 */
  data: string;
  /** "ip:port" of the sender */
  from: string;
}

export interface UdpTelemetryPlugin {
  /** bind a UDP socket on all interfaces and start emitting `packet` events */
  start(options: { port: number }): Promise<void>;
  stop(): Promise<void>;
  /** this device's IPv4 addresses, to type into the game's Data Out settings */
  getAddresses(): Promise<{ addresses: string[] }>;
  addListener(event: 'packet', listener: (e: UdpPacketEvent) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export declare const UdpTelemetry: UdpTelemetryPlugin;
