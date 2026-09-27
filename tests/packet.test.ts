import { describe, expect, it } from 'vitest';
import { encodePacket, parsePacket } from '../src/shared/packet';

const sample = {
  isRaceOn: true,
  timestampMs: 123456,
  engineMaxRpm: 8000,
  engineIdleRpm: 850,
  currentEngineRpm: 6123.5,
  accelerationX: -3.5,
  velocityZ: 42,
  yaw: 1.25,
  normalizedSuspensionTravel: [0.1, 0.2, 0.3, 0.4] as [number, number, number, number],
  wheelOnRumbleStrip: [1, 0, 1, 0] as [number, number, number, number],
  tireSlipAngle: [0.5, -0.5, 0.25, -0.25] as [number, number, number, number],
  carOrdinal: 3453,
  carClass: 5,
  carPerformanceIndex: 901,
  drivetrainType: 2,
  numCylinders: 8,
  horizonCarCategory: 17,
  positionX: 1000.5,
  positionZ: -250.25,
  speed: 55.5,
  power: 300000,
  torque: 520,
  tireTemp: [180, 181, 182, 183] as [number, number, number, number],
  boost: 14.5,
  fuel: 0.75,
  distanceTraveled: 12345.5,
  bestLap: 91.5,
  lastLap: 92.25,
  currentLap: 33.5,
  currentRaceTime: 250,
  lapNumber: 3,
  racePosition: 2,
  accel: 255,
  brake: 12,
  clutch: 7,
  handBrake: 1,
  gear: 4,
  steer: -64,
  normalizedDrivingLine: 12,
  normalizedAIBrakeDifference: -5,
};

describe('parsePacket', () => {
  it('round-trips the 324-byte Horizon layout', () => {
    const buf = encodePacket(sample, 'FH');
    expect(buf.byteLength).toBe(324);
    const f = parsePacket(buf)!;
    expect(f.format).toBe('FH');
    expect(f.isRaceOn).toBe(true);
    expect(f.currentEngineRpm).toBeCloseTo(6123.5);
    expect(f.accelerationX).toBeCloseTo(-3.5);
    expect(f.normalizedSuspensionTravel[3]).toBeCloseTo(0.4);
    expect(f.wheelOnRumbleStrip).toEqual([1, 0, 1, 0]);
    expect(f.carOrdinal).toBe(3453);
    expect(f.horizonCarCategory).toBe(17);
    expect(f.positionX).toBeCloseTo(1000.5);
    expect(f.speed).toBeCloseTo(55.5);
    expect(f.tireTemp[2]).toBeCloseTo(182);
    expect(f.lapNumber).toBe(3);
    expect(f.racePosition).toBe(2);
    expect(f.accel).toBe(255);
    expect(f.gear).toBe(4);
    expect(f.steer).toBe(-64);
    expect(f.normalizedAIBrakeDifference).toBe(-5);
    expect(f.tireWear).toBeNull();
  });

  it('parses the Horizon dash at offset 244 (known byte positions)', () => {
    const buf = encodePacket(sample, 'FH');
    const v = new DataView(buf);
    expect(v.getFloat32(256, true)).toBeCloseTo(55.5); // speed
    expect(v.getUint8(319)).toBe(4); // gear
  });

  it('round-trips the 311-byte FM7 layout', () => {
    const f = parsePacket(encodePacket(sample, 'FM7'))!;
    expect(f.format).toBe('FM7');
    expect(f.speed).toBeCloseTo(55.5);
    expect(f.steer).toBe(-64);
    expect(f.horizonCarCategory).toBe(0);
  });

  it('round-trips the 331-byte FM2023 layout with tire wear', () => {
    const f = parsePacket(encodePacket({ ...sample, tireWear: [0.1, 0.2, 0.3, 0.4], trackOrdinal: 42 }, 'FM8'))!;
    expect(f.format).toBe('FM8');
    expect(f.tireWear![1]).toBeCloseTo(0.2);
    expect(f.trackOrdinal).toBe(42);
    expect(f.gear).toBe(4);
  });

  it('rejects short packets and handles Uint8Array views with offsets', () => {
    expect(parsePacket(new Uint8Array(100))).toBeNull();
    const buf = new Uint8Array(400);
    buf.set(new Uint8Array(encodePacket(sample, 'FH')), 50);
    const f = parsePacket(buf.subarray(50, 374))!;
    expect(f.speed).toBeCloseTo(55.5);
  });

  it('all-zero menu packet is not race-on', () => {
    const f = parsePacket(new ArrayBuffer(324))!;
    expect(f.isRaceOn).toBe(false);
    expect(f.speed).toBe(0);
  });
});
