import { encodePacket, type Frame, type Wheels } from './packet';

/**
 * Synthetic driver on a closed circuit. Produces realistic-looking FH packets
 * so the UI can be exercised without the game.
 */
export class DemoSim {
  private t = 0;
  private s = 0; // distance along track
  private v = 20; // m/s
  private gear = 2;
  private rpm = 3000;
  private lap = 0;
  private lapStart = 0;
  private lastLapTime = 0;
  private bestLap = 0;
  private dist = 0;
  private wheelAngle = 0;
  private fuel = 1;
  private temps: Wheels = [150, 150, 150, 150];
  private prevYaw = 0;
  private prevV = 20;

  readonly maxRpm = 8200;
  readonly idleRpm = 900;
  private readonly ratios = [0, 3.2, 2.3, 1.75, 1.38, 1.13, 0.94, 0.8];
  private readonly finalDrive = 3.6;
  private readonly wheelR = 0.34;

  // Track: sum of harmonics gives a nice irregular loop
  private trackPoint(u: number): [number, number] {
    const a = u * Math.PI * 2;
    const r = 480 + 130 * Math.sin(3 * a) + 60 * Math.cos(5 * a + 1) + 25 * Math.sin(7 * a);
    return [Math.cos(a) * r * 1.3, Math.sin(a) * r];
  }

  private readonly trackLen: number;
  private readonly samples: { s: number; x: number; z: number }[] = [];

  constructor() {
    let s = 0;
    let [px, pz] = this.trackPoint(0);
    const N = 4000;
    this.samples.push({ s: 0, x: px, z: pz });
    for (let i = 1; i <= N; i++) {
      const [x, z] = this.trackPoint(i / N);
      s += Math.hypot(x - px, z - pz);
      this.samples.push({ s, x, z });
      px = x;
      pz = z;
    }
    this.trackLen = s;
  }

  private at(s: number) {
    s = ((s % this.trackLen) + this.trackLen) % this.trackLen;
    const arr = this.samples;
    let lo = 0;
    let hi = arr.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (arr[m].s <= s) lo = m;
      else hi = m;
    }
    const a = arr[lo];
    const b = arr[hi];
    const k = (s - a.s) / (b.s - a.s || 1);
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  }

  private curvature(s: number) {
    const h = 8;
    const p0 = this.at(s - h);
    const p1 = this.at(s);
    const p2 = this.at(s + h);
    const h1 = Math.atan2(p1.z - p0.z, p1.x - p0.x);
    const h2 = Math.atan2(p2.z - p1.z, p2.x - p1.x);
    let dh = h2 - h1;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    return dh / (2 * h);
  }

  step(dt: number): Frame {
    this.t += dt;
    // Target speed from upcoming curvature (look ahead)
    let maxK = 0;
    for (let la = 0; la < 160; la += 10) maxK = Math.max(maxK, Math.abs(this.curvature(this.s + la)) * (1 - la / 260));
    const grip = 1.25 * 9.81;
    const vTarget = Math.min(88, Math.sqrt(grip / Math.max(maxK, 1e-4)));
    let accel = 0;
    let brake = 0;
    if (this.v < vTarget - 1) accel = Math.min(1, (vTarget - this.v) / 6);
    else if (this.v > vTarget + 0.5) brake = Math.min(1, (this.v - vTarget) / 5);

    const pwr = 420000 * accel * Math.min(1, this.rpm / 5500);
    const drag = 0.38 * this.v * this.v + 180;
    const fDrive = pwr / Math.max(this.v, 3);
    const fBrake = brake * 14000;
    const mass = 1450;
    const a = (fDrive - drag - fBrake) / mass;
    this.v = Math.max(3, this.v + a * dt);
    this.s += this.v * dt;
    this.dist += this.v * dt;

    // gearbox
    const wheelRps = this.v / (2 * Math.PI * this.wheelR);
    const rpmFor = (g: number) => wheelRps * 60 * this.ratios[g] * this.finalDrive;
    if (rpmFor(this.gear) > 7700 && this.gear < 7) this.gear++;
    else if (this.gear > 1 && rpmFor(this.gear - 1) < 6300 && brake > 0.1) this.gear--;
    this.rpm = Math.max(this.idleRpm + 200 * accel, Math.min(this.maxRpm, rpmFor(this.gear)));

    const k = this.curvature(this.s);
    const latA = this.v * this.v * k;
    const p = this.at(this.s);
    const p2 = this.at(this.s + 2);
    const yaw = Math.atan2(p2.x - p.x, p2.z - p.z);
    let dYaw = yaw - this.prevYaw;
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    this.prevYaw = yaw;
    const longA = (this.v - this.prevV) / dt;
    this.prevV = this.v;

    // laps
    if (this.s - this.lapStart >= this.trackLen) {
      const lt = this.t - (this.lapStartTime ?? 0);
      this.lastLapTime = lt;
      if (!this.bestLap || lt < this.bestLap) this.bestLap = lt;
      this.lap++;
      this.lapStart += this.trackLen;
      this.lapStartTime = this.t;
    }
    this.fuel = Math.max(0, this.fuel - dt * 0.00035 * (0.2 + accel));

    const steer = Math.max(-127, Math.min(127, Math.round(k * 2600)));
    this.wheelAngle += wheelRps * 2 * Math.PI * dt;
    const slipBase = Math.min(1, Math.abs(latA) / grip);
    const heat = (i: number) => {
      const load = Math.abs(latA) * (i % 2 === (latA > 0 ? 1 : 0) ? 1.4 : 0.6) + (i < 2 ? brake * 10 : accel * 6);
      const target = 150 + load * 5.5;
      this.temps[i] += (target - this.temps[i]) * dt * 0.25;
      return this.temps[i];
    };
    const susp = (i: number) => {
      const left = i % 2 === 0;
      const front = i < 2;
      let x = 0.5 + (left ? -1 : 1) * latA * 0.018 + (front ? 1 : -1) * longA * 0.012;
      x += Math.sin(this.t * 13 + i) * 0.015;
      return Math.max(0, Math.min(1, x));
    };
    const suspN: Wheels = [susp(0), susp(1), susp(2), susp(3)];
    const wheelSpeed = wheelRps * 2 * Math.PI;
    const rumble = Math.abs(k) > 0.006 && Math.sin(this.s / 3) > 0.7 ? 1 : 0;

    return {
      format: 'FH',
      size: 324,
      isRaceOn: true,
      timestampMs: Math.round(this.t * 1000),
      engineMaxRpm: this.maxRpm,
      engineIdleRpm: this.idleRpm,
      currentEngineRpm: this.rpm,
      accelerationX: latA,
      accelerationY: Math.sin(this.t * 9) * 0.3,
      accelerationZ: longA,
      velocityX: this.v * slipBase * 0.04,
      velocityY: 0,
      velocityZ: this.v,
      angularVelocityX: 0,
      angularVelocityY: dYaw / dt,
      angularVelocityZ: 0,
      yaw,
      pitch: -longA * 0.004,
      roll: latA * 0.006,
      normalizedSuspensionTravel: suspN,
      tireSlipRatio: [brake * -0.08, brake * -0.08, accel * 0.12, accel * 0.12],
      wheelRotationSpeed: [wheelSpeed, wheelSpeed, wheelSpeed * (1 + accel * 0.05), wheelSpeed * (1 + accel * 0.05)],
      wheelOnRumbleStrip: [rumble, 0, rumble, 0],
      wheelInPuddleDepth: [0, 0, 0, 0],
      surfaceRumble: [rumble * 0.6, 0.05, rumble * 0.6, 0.05],
      tireSlipAngle: [slipBase * 0.5, slipBase * 0.5, slipBase * 0.35, slipBase * 0.35],
      tireCombinedSlip: [slipBase * 0.6 + brake * 0.3, slipBase * 0.6 + brake * 0.3, slipBase * 0.5 + accel * 0.2, slipBase * 0.5 + accel * 0.2],
      suspensionTravelMeters: suspN.map((n) => n * 0.12) as Wheels,
      carOrdinal: 3453,
      carClass: 4,
      carPerformanceIndex: 842,
      drivetrainType: 2,
      numCylinders: 6,
      horizonCarCategory: 0,
      horizonUnknown1: 0,
      horizonUnknown2: 0,
      positionX: p.x,
      positionY: 40 + Math.sin(this.s / 300) * 12,
      positionZ: p.z,
      speed: this.v,
      power: pwr,
      torque: pwr / Math.max(1, (this.rpm / 60) * 2 * Math.PI),
      tireTemp: [heat(0), heat(1), heat(2), heat(3)],
      boost: Math.max(-10, accel * 21 * Math.min(1, this.rpm / 4000) - 3),
      fuel: this.fuel,
      distanceTraveled: this.dist,
      bestLap: this.bestLap,
      lastLap: this.lastLapTime,
      currentLap: this.t - (this.lapStartTime ?? 0),
      currentRaceTime: this.t,
      lapNumber: this.lap,
      racePosition: 1 + (Math.floor(this.t / 40) % 4),
      accel: Math.round(accel * 255),
      brake: Math.round(brake * 255),
      clutch: 0,
      handBrake: 0,
      gear: this.gear,
      steer,
      normalizedDrivingLine: Math.round(Math.sin(this.s / 90) * 40),
      normalizedAIBrakeDifference: Math.round(brake * 60),
      tireWear: null,
      trackOrdinal: null,
    };
  }

  private lapStartTime: number | undefined;

  stepPacket(dt: number): ArrayBuffer {
    return encodePacket(this.step(dt), 'FH');
  }
}
