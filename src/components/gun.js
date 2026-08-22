/**
 * Gun shooting component for WebXR rhythm mode.
 * Handles aiming, trigger events, recoil, laser visuals, audio synthesis, and beat collision/scoring.
 */

const WEAPON_COLORS = { left: 'red', right: 'blue' };
const GUN_AIM_DISTANCE = 25; // meters to trace forward
const AIM_HIT_RADIUS = 0.65; // radius around beat center to count as aim hit

let audioCtx = null;
function getAudioContext () {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

AFRAME.registerComponent('gun', {
  schema: {
    enabled: { default: false },
    hand: { default: 'right', oneOf: ['left', 'right'] }
  },

  init: function () {
    const el = this.el;
    this.hand = this.data.hand;
    this.color = WEAPON_COLORS[this.hand];

    this.muzzlePos = new THREE.Vector3();
    this.aimDir = new THREE.Vector3();
    this.rayStart = new THREE.Vector3();
    this.rayEnd = new THREE.Vector3();
    this.beatPos = new THREE.Vector3();
    this.tempVec = new THREE.Vector3();
    this.recoilOffset = 0;

    this.gunContainer = null;
    this.muzzleFlash = null;
    this.laserBolt = null;
    this.laserBoltLife = 0;

    this.onTriggerDown = this.onTriggerDown.bind(this);

    // Dummy properties for beat-system compatibility
    this.bbox = new THREE.Box3();
    this.speed = 10;
    this.strokeSpeed = 10;

    this.setupGunVisuals();
  },

  setupGunVisuals: function () {
    this.gunContainer = this.el.querySelector('.gunContainer');
    this.muzzleFlash = this.el.querySelector('.muzzleFlash');
    this.laserBolt = this.el.querySelector('.laserBolt');
  },

  play: function () {
    const el = this.el;
    el.addEventListener('triggerdown', this.onTriggerDown);
    el.addEventListener('gripdown', this.onTriggerDown);
    el.addEventListener('abuttondown', this.onTriggerDown);
    el.addEventListener('xbuttondown', this.onTriggerDown);
    el.addEventListener('trackpaddown', this.onTriggerDown);

    this.rigEl = document.getElementById('curveFollowRig');
    this.curveEl = document.getElementById('curve');
    this.beatSystem = this.el.sceneEl.components['beat-system'];
  },

  pause: function () {
    const el = this.el;
    el.removeEventListener('triggerdown', this.onTriggerDown);
    el.removeEventListener('gripdown', this.onTriggerDown);
    el.removeEventListener('abuttondown', this.onTriggerDown);
    el.removeEventListener('xbuttondown', this.onTriggerDown);
    el.removeEventListener('trackpaddown', this.onTriggerDown);
  },

  update: function (oldData) {
    this.hand = this.data.hand;
    this.color = WEAPON_COLORS[this.hand];
  },

  tick: function (time, delta) {
    if (!this.data.enabled) { return; }

    // Recover from recoil kickback
    if (this.recoilOffset > 0.001) {
      this.recoilOffset -= (delta / 1000) * 0.4;
      if (this.recoilOffset < 0) { this.recoilOffset = 0; }
      if (this.gunContainer) {
        this.gunContainer.object3D.position.z = this.recoilOffset;
        this.gunContainer.object3D.rotation.x = -this.recoilOffset * 2.5;
      }
    }

    // Update laser bolt / projectile animation
    if (this.laserBolt && this.laserBoltLife > 0) {
      this.laserBoltLife -= delta;
      if (this.laserBoltLife <= 0) {
        this.laserBolt.object3D.visible = false;
        if (this.muzzleFlash) { this.muzzleFlash.object3D.visible = false; }
      } else {
        const progress = 1 - (this.laserBoltLife / 120);
        this.laserBolt.object3D.position.z = -progress * 15;
      }
    }
  },

  tickBeatSystem: function () {
    // Called by beat-system tick
  },

  checkCollision: function (beat) {
    return false;
  },

  onTriggerDown: function (evt) {
    if (!this.data.enabled) { return; }
    this.shoot();
  },

  shoot: function () {
    const el = this.el;
    const sceneEl = el.sceneEl;

    // Apply recoil
    this.recoilOffset = 0.05;
    if (this.gunContainer) {
      this.gunContainer.object3D.position.z = this.recoilOffset;
      this.gunContainer.object3D.rotation.x = -this.recoilOffset * 2.5;
    }

    // Flash muzzle and fire laser projectile
    if (this.muzzleFlash) {
      this.muzzleFlash.object3D.visible = true;
      this.muzzleFlash.object3D.scale.set(1.5, 1.5, 1.5);
    }
    if (this.laserBolt) {
      this.laserBolt.object3D.visible = true;
      this.laserBolt.object3D.position.set(0, 0, 0);
      this.laserBoltLife = 120; // ms duration
    }

    // Play synthesized laser sound
    this.playLaserSound();

    // Haptics on fire
    try {
      if (el.components.haptics) {
        el.components.haptics.pulse();
      }
    } catch (e) {}

    // Calculate aim ray from controller
    this.calculateAimRay();

    // Find and hit target beats
    this.checkHitBeats();
  },

  calculateAimRay: function () {
    const el = this.el;
    el.object3D.getWorldPosition(this.rayStart);

    // Forward direction in Three.js coordinates (-Z in local object space, angled slightly for natural gun grip)
    this.aimDir.set(0, 0.12, -1).normalize();
    this.aimDir.applyQuaternion(el.object3D.getWorldQuaternion(new THREE.Quaternion()));

    this.rayEnd.copy(this.rayStart).addScaledVector(this.aimDir, GUN_AIM_DISTANCE);
  },

  checkHitBeats: function () {
    if (!this.beatSystem) {
      this.beatSystem = this.el.sceneEl.components['beat-system'];
      if (!this.beatSystem) { return; }
    }

    const activeBeats = this.beatSystem.beats;
    if (!activeBeats || !activeBeats.length) { return; }

    const rayStart = this.rayStart;
    const aimDir = this.aimDir;

    let bestBeat = null;
    let closestDistAlongRay = Infinity;
    let bestAimDistance = Infinity;

    for (let i = 0; i < activeBeats.length; i++) {
      const beat = activeBeats[i];
      if (beat.destroyed || !beat.el.object3D.visible) { continue; }

      // Get world position of the beat
      beat.el.object3D.getWorldPosition(this.beatPos);

      // Check if beat is in front of player
      this.tempVec.copy(this.beatPos).sub(rayStart);
      const distAlongRay = this.tempVec.dot(aimDir);

      // Only consider beats within forward hit range (0.3m to 16m)
      if (distAlongRay < 0.3 || distAlongRay > 16) { continue; }

      // Calculate perpendicular distance from beat center to aim line
      const perpPoint = this.tempVec.copy(rayStart).addScaledVector(aimDir, distAlongRay);
      const perpDist = perpPoint.distanceTo(this.beatPos);

      // Generous hit radius for rhythm aiming
      if (perpDist <= AIM_HIT_RADIUS) {
        if (distAlongRay < closestDistAlongRay) {
          closestDistAlongRay = distAlongRay;
          bestAimDistance = perpDist;
          bestBeat = beat;
        }
      }
    }

    if (bestBeat) {
      this.processBeatHit(bestBeat, closestDistAlongRay, bestAimDistance);
    }
  },

  processBeatHit: function (beat, distAlongRay, perpDist) {
    const el = this.el;
    const sceneEl = el.sceneEl;

    // Haptics impact pulse
    try {
      if (el.components.haptics__beat) {
        el.components.haptics__beat.pulse();
      }
    } catch (e) {}

    // Mine hit
    if (beat.data.type === 'mine') {
      beat.destroyBeat(el, false);
      sceneEl.emit('minehit', null, true);
      if (beat.el.parentNode && beat.el.parentNode.components['beat-hit-sound']) {
        beat.el.parentNode.components['beat-hit-sound'].playSound(beat.el, beat.cutDirection);
      }
      return;
    }

    // Color match check
    const isCorrectColor = beat.data.color === this.color;

    if (!isCorrectColor) {
      beat.onHit(el, true);
      beat.destroyBeat(el, false);
      return;
    }

    // Correct color hit!
    if (beat.el.parentNode && beat.el.parentNode.components['beat-hit-sound']) {
      beat.el.parentNode.components['beat-hit-sound'].playSound(beat.el, beat.cutDirection);
    }

    beat.destroyBeat(el, true);
    this.calculateScore(beat, distAlongRay, perpDist);
  },

  calculateScore: function (beat, distAlongRay, perpDist) {
    const base = 60;
    const idealDist = 2.5;
    const timingDiff = Math.abs(distAlongRay - idealDist);
    const timingScore = Math.max(0, 1 - (timingDiff / 3.0)) * 20;
    const aimScore = Math.max(0, 1 - (perpDist / AIM_HIT_RADIUS)) * 20;

    const score = Math.min(100, Math.round(base + timingScore + aimScore));
    const percent = score;

    beat.score(score, percent);
  },

  playLaserSound: function () {
    try {
      const ctx = getAudioContext();
      if (!ctx) { return; }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      const startFreq = this.hand === 'left' ? 760 : 880;
      const endFreq = this.hand === 'left' ? 110 : 140;

      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.09);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch (err) {}
  }
});
