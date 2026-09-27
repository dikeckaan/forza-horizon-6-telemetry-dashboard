import { registerPlugin } from '@capacitor/core';

/** Native UDP listener for Forza "Data Out" packets (Android + iOS). */
export const UdpTelemetry = registerPlugin('UdpTelemetry');
