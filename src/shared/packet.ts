// Forza "Data Out" packet parser.
// Layouts:
//   311 bytes — Forza Motorsport 7 "Dash" (sled 0..231, dash 232..310)
//   324 bytes — Forza Horizon 4/5/6 (sled 0..231, 12-byte horizon block, dash 244..322, 1 pad)
//   331 bytes — Forza Motorsport (2023): FM7 dash + tire wear x4 + track ordinal

export type Wheels = [fl: number, fr: number, rl: number, rr: number];

export type PacketFormat = 'FM7' | 'FH' | 'FM8' | 'unknown';

export interface Frame {
  format: PacketFormat;
  size: number;
  isRaceOn: boolean;
  timestampMs: number;

  engineMaxRpm: number;
  engineIdleRpm: number;
  currentEngineRpm: number;

  /** local car space, m/s², X right, Y up, Z forward */
  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  angularVelocityX: number;
  angularVelocityY: number;
  angularVelocityZ: number;

  yaw: number;
  pitch: number;
  roll: number;

  normalizedSuspensionTravel: Wheels;
  tireSlipRatio: Wheels;
  wheelRotationSpeed: Wheels;
  wheelOnRumbleStrip: Wheels;
  wheelInPuddleDepth: Wheels;
  surfaceRumble: Wheels;
  tireSlipAngle: Wheels;
  tireCombinedSlip: Wheels;
  suspensionTravelMeters: Wheels;

  carOrdinal: number;
  carClass: number;
  carPerformanceIndex: number;
  drivetrainType: number;
  numCylinders: number;

  /** Horizon-only 12-byte block (car category + unknowns) */
  horizonCarCategory: number;
  horizonUnknown1: number;
  horizonUnknown2: number;

  positionX: number;
  positionY: number;
  positionZ: number;
  /** m/s */
  speed: number;
  /** watts */
  power: number;
  /** Nm */
  torque: number;
  /** Fahrenheit */
  tireTemp: Wheels;
  /** psi */
  boost: number;
  /** 0..1 */
  fuel: number;
  /** meters */
  distanceTraveled: number;
  bestLap: number;
  lastLap: number;
  currentLap: number;
  currentRaceTime: number;
  lapNumber: number;
  racePosition: number;
  /** 0..255 */
  accel: number;
  brake: number;
  clutch: number;
  handBrake: number;
  gear: number;
  /** -127..127 */
  steer: number;
  normalizedDrivingLine: number;
  normalizedAIBrakeDifference: number;

  /** FM2023 only */
  tireWear: Wheels | null;
  trackOrdinal: number | null;
}

export function detectFormat(size: number): PacketFormat {
  if (size === 324) return 'FH';
  if (size === 311) return 'FM7';
  if (size === 331) return 'FM8';
  return 'unknown';
}

function wheels(v: DataView, off: number, int = false): Wheels {
  const r = (i: number) => (int ? v.getInt32(off + i * 4, true) : v.getFloat32(off + i * 4, true));
  return [r(0), r(1), r(2), r(3)];
}

/** Minimum bytes needed for the sled section. Shorter packets are rejected. */
export const SLED_SIZE = 232;

export function parsePacket(input: ArrayBuffer | ArrayBufferView): Frame | null {
  const v =
    input instanceof ArrayBuffer
      ? new DataView(input)
      : new DataView(input.buffer, input.byteOffset, input.byteLength);
  const size = v.byteLength;
  if (size < SLED_SIZE) return null;

  let format = detectFormat(size);
  // Unknown sizes: guess the closest known layout (Horizon if there is room for it).
  if (format === 'unknown') format = size >= 323 ? 'FH' : 'FM7';

  const f32 = (o: number) => v.getFloat32(o, true);
  const i32 = (o: number) => v.getInt32(o, true);

  const hasHorizon = format === 'FH';
  const d = hasHorizon ? 244 : 232;
  const hasDash = size >= d + 79;

  const frame: Frame = {
    format,
    size,
    isRaceOn: i32(0) === 1,
    timestampMs: v.getUint32(4, true),
    engineMaxRpm: f32(8),
    engineIdleRpm: f32(12),
    currentEngineRpm: f32(16),
    accelerationX: f32(20),
    accelerationY: f32(24),
    accelerationZ: f32(28),
    velocityX: f32(32),
    velocityY: f32(36),
    velocityZ: f32(40),
    angularVelocityX: f32(44),
    angularVelocityY: f32(48),
    angularVelocityZ: f32(52),
    yaw: f32(56),
    pitch: f32(60),
    roll: f32(64),
    normalizedSuspensionTravel: wheels(v, 68),
    tireSlipRatio: wheels(v, 84),
    wheelRotationSpeed: wheels(v, 100),
    wheelOnRumbleStrip: wheels(v, 116, true),
    wheelInPuddleDepth: wheels(v, 132),
    surfaceRumble: wheels(v, 148),
    tireSlipAngle: wheels(v, 164),
    tireCombinedSlip: wheels(v, 180),
    suspensionTravelMeters: wheels(v, 196),
    carOrdinal: i32(212),
    carClass: i32(216),
    carPerformanceIndex: i32(220),
    drivetrainType: i32(224),
    numCylinders: i32(228),
    horizonCarCategory: hasHorizon ? i32(232) : 0,
    horizonUnknown1: hasHorizon ? i32(236) : 0,
    horizonUnknown2: hasHorizon ? i32(240) : 0,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    speed: 0,
    power: 0,
    torque: 0,
    tireTemp: [0, 0, 0, 0],
    boost: 0,
    fuel: 0,
    distanceTraveled: 0,
    bestLap: 0,
    lastLap: 0,
    currentLap: 0,
    currentRaceTime: 0,
    lapNumber: 0,
    racePosition: 0,
    accel: 0,
    brake: 0,
    clutch: 0,
    handBrake: 0,
    gear: 0,
    steer: 0,
    normalizedDrivingLine: 0,
    normalizedAIBrakeDifference: 0,
    tireWear: null,
    trackOrdinal: null,
  };

  if (hasDash) {
    frame.positionX = f32(d);
    frame.positionY = f32(d + 4);
    frame.positionZ = f32(d + 8);
    frame.speed = f32(d + 12);
    frame.power = f32(d + 16);
    frame.torque = f32(d + 20);
    frame.tireTemp = wheels(v, d + 24);
    frame.boost = f32(d + 40);
    frame.fuel = f32(d + 44);
    frame.distanceTraveled = f32(d + 48);
    frame.bestLap = f32(d + 52);
    frame.lastLap = f32(d + 56);
    frame.currentLap = f32(d + 60);
    frame.currentRaceTime = f32(d + 64);
    frame.lapNumber = v.getUint16(d + 68, true);
    frame.racePosition = v.getUint8(d + 70);
    frame.accel = v.getUint8(d + 71);
    frame.brake = v.getUint8(d + 72);
    frame.clutch = v.getUint8(d + 73);
    frame.handBrake = v.getUint8(d + 74);
    frame.gear = v.getUint8(d + 75);
    frame.steer = v.getInt8(d + 76);
    frame.normalizedDrivingLine = v.getInt8(d + 77);
    frame.normalizedAIBrakeDifference = v.getInt8(d + 78);
  }

  if (format === 'FM8' && size >= 331) {
    frame.tireWear = wheels(v, 311);
    frame.trackOrdinal = i32(327);
  }

  return frame;
}

// ---- Encoder (used by the demo generator and tests) ----

export function encodePacket(f: Partial<Frame>, format: Exclude<PacketFormat, 'unknown'> = 'FH'): ArrayBuffer {
  const size = format === 'FH' ? 324 : format === 'FM7' ? 311 : 331;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  const f32 = (o: number, x = 0) => v.setFloat32(o, x, true);
  const i32 = (o: number, x = 0) => v.setInt32(o, x, true);
  const w = (o: number, x: Wheels | undefined, int = false) =>
    (x ?? [0, 0, 0, 0]).forEach((val, i) => (int ? i32(o + i * 4, val) : f32(o + i * 4, val)));

  i32(0, f.isRaceOn ? 1 : 0);
  v.setUint32(4, f.timestampMs ?? 0, true);
  f32(8, f.engineMaxRpm);
  f32(12, f.engineIdleRpm);
  f32(16, f.currentEngineRpm);
  f32(20, f.accelerationX);
  f32(24, f.accelerationY);
  f32(28, f.accelerationZ);
  f32(32, f.velocityX);
  f32(36, f.velocityY);
  f32(40, f.velocityZ);
  f32(44, f.angularVelocityX);
  f32(48, f.angularVelocityY);
  f32(52, f.angularVelocityZ);
  f32(56, f.yaw);
  f32(60, f.pitch);
  f32(64, f.roll);
  w(68, f.normalizedSuspensionTravel);
  w(84, f.tireSlipRatio);
  w(100, f.wheelRotationSpeed);
  w(116, f.wheelOnRumbleStrip, true);
  w(132, f.wheelInPuddleDepth);
  w(148, f.surfaceRumble);
  w(164, f.tireSlipAngle);
  w(180, f.tireCombinedSlip);
  w(196, f.suspensionTravelMeters);
  i32(212, f.carOrdinal);
  i32(216, f.carClass);
  i32(220, f.carPerformanceIndex);
  i32(224, f.drivetrainType);
  i32(228, f.numCylinders);
  let d = 232;
  if (format === 'FH') {
    i32(232, f.horizonCarCategory);
    i32(236, f.horizonUnknown1);
    i32(240, f.horizonUnknown2);
    d = 244;
  }
  f32(d, f.positionX);
  f32(d + 4, f.positionY);
  f32(d + 8, f.positionZ);
  f32(d + 12, f.speed);
  f32(d + 16, f.power);
  f32(d + 20, f.torque);
  w(d + 24, f.tireTemp);
  f32(d + 40, f.boost);
  f32(d + 44, f.fuel);
  f32(d + 48, f.distanceTraveled);
  f32(d + 52, f.bestLap);
  f32(d + 56, f.lastLap);
  f32(d + 60, f.currentLap);
  f32(d + 64, f.currentRaceTime);
  v.setUint16(d + 68, f.lapNumber ?? 0, true);
  v.setUint8(d + 70, f.racePosition ?? 0);
  v.setUint8(d + 71, f.accel ?? 0);
  v.setUint8(d + 72, f.brake ?? 0);
  v.setUint8(d + 73, f.clutch ?? 0);
  v.setUint8(d + 74, f.handBrake ?? 0);
  v.setUint8(d + 75, f.gear ?? 0);
  v.setInt8(d + 76, f.steer ?? 0);
  v.setInt8(d + 77, f.normalizedDrivingLine ?? 0);
  v.setInt8(d + 78, f.normalizedAIBrakeDifference ?? 0);
  if (format === 'FM8') {
    w(311, f.tireWear ?? undefined);
    i32(327, f.trackOrdinal ?? 0);
  }
  return buf;
}
