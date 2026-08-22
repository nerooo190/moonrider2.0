const COLORS = require('../constants/colors.js');

let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Procedural Web Audio synthesizer for energy shield deflections.
 */
function playShieldDeflectSound(isDual) {
  try {
    const ctx = getAudioContext();
    if (!ctx) { return; }
    const now = ctx.currentTime;

    if (isDual) {
      // Powerful Dual-Shield Mega Fusion Deflect Sound
      // Sub-bass impact
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(140, now);
      subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.35);
      subGain.gain.setValueAtTime(0.7, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.35);

      // Energy discharge crackle
      const energyOsc = ctx.createOscillator();
      const energyGain = ctx.createGain();
      energyOsc.type = 'sawtooth';
      energyOsc.frequency.setValueAtTime(880, now);
      energyOsc.frequency.exponentialRampToValueAtTime(220, now + 0.25);
      energyGain.gain.setValueAtTime(0.35, now);
      energyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      energyOsc.connect(energyGain);
      energyGain.connect(ctx.destination);
      energyOsc.start(now);
      energyOsc.stop(now + 0.25);
    } else {
      // Standard Energy Shield Deflect Ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);

      // Laser harmonic shimmer
      const harmOsc = ctx.createOscillator();
      const harmGain = ctx.createGain();
      harmOsc.type = 'sine';
      harmOsc.frequency.setValueAtTime(1200, now);
      harmOsc.frequency.exponentialRampToValueAtTime(400, now + 0.12);
      harmGain.gain.setValueAtTime(0.2, now);
      harmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      harmOsc.connect(harmGain);
      harmGain.connect(ctx.destination);
      harmOsc.start(now);
      harmOsc.stop(now + 0.12);
    }
  } catch (e) {
    // Audio synthesis fallback
  }
}

const SHIELD_RADIUS = 0.35;
const DUAL_SHIELD_PROXIMITY = 0.45; // Distance between shields to form Dual Barrier

const currentPosition = new THREE.Vector3();
const previousPosition = new THREE.Vector3();
const otherShieldPosition = new THREE.Vector3();

AFRAME.registerComponent('shield', {
  schema: {
    enabled: { default: true },
    hand: { default: 'right' }
  },

  init: function () {
    this.bbox = new THREE.Box3();
    this.speed = 0;
    this.strokeSpeed = 10;
    this.isDualShieldActive = false;
    this.otherShieldEl = null;

    this.shieldContainer = null;
    this.shieldRim = null;
    this.shieldEnergyDisc = null;
    this.shieldCore = null;
    this.shieldFusionGlow = null;

    this.onBlock = this.onBlock.bind(this);
    this.el.addEventListener('block', this.onBlock);
  },

  play: function () {
    this.shieldContainer = this.el.querySelector('.shieldContainer');
    this.shieldRim = this.el.querySelector('.shieldRim');
    this.shieldEnergyDisc = this.el.querySelector('.shieldEnergyDisc');
    this.shieldCore = this.el.querySelector('.shieldCore');
    this.shieldFusionGlow = this.el.querySelector('.shieldFusionGlow');

    const otherHand = this.data.hand === 'left' ? 'right' : 'left';
    this.otherShieldEl = document.getElementById(otherHand + 'Hand');
  },

  tickBeatSystem: function (t, dt) {
    if (!this.data.enabled) { return; }

    const obj = this.el.object3D;
    obj.getWorldPosition(currentPosition);

    // Calculate hand speed
    if (previousPosition.lengthSq() > 0 && dt > 0) {
      const dist = currentPosition.distanceTo(previousPosition);
      this.speed = (dist / dt) * 1000;
      this.strokeSpeed = Math.max(10, this.speed * 5);
    }
    previousPosition.copy(currentPosition);

    // Check Dual Shield proximity
    if (this.otherShieldEl && this.otherShieldEl.object3D) {
      this.otherShieldEl.object3D.getWorldPosition(otherShieldPosition);
      const distBetweenHands = currentPosition.distanceTo(otherShieldPosition);
      const wasDual = this.isDualShieldActive;
      this.isDualShieldActive = distBetweenHands < DUAL_SHIELD_PROXIMITY;

      if (this.isDualShieldActive !== wasDual) {
        if (this.shieldFusionGlow) {
          this.shieldFusionGlow.setAttribute('visible', this.isDualShieldActive);
        }
      }
    }

    // Update Bounding Box for shield coverage (wide circular deflection barrier)
    const r = this.isDualShieldActive ? SHIELD_RADIUS * 1.35 : SHIELD_RADIUS;
    this.bbox.min.set(currentPosition.x - r, currentPosition.y - r, currentPosition.z - 0.30);
    this.bbox.max.set(currentPosition.x + r, currentPosition.y + r, currentPosition.z + 0.30);
  },

  checkCollision: function (beat) {
    if (!this.data.enabled || !beat || !beat.el) { return false; }
    const beatObj = beat.el.object3D;
    if (!beatObj) { return false; }

    const beatPos = beatObj.position;
    return this.bbox.containsPoint(beatPos);
  },

  onBlock: function (isDual) {
    playShieldDeflectSound(isDual || this.isDualShieldActive);

    // Controller vibration (haptics)
    if (this.el.components['haptics']) {
      this.el.components['haptics'].pulse(isDual ? 1.0 : 0.65, isDual ? 180 : 90);
    }

    // Shield flash & ripple visual feedback
    if (this.shieldContainer) {
      const containerObj = this.shieldContainer.object3D;
      containerObj.scale.set(1.25, 1.25, 1.25);
      setTimeout(() => {
        if (containerObj) { containerObj.scale.set(1, 1, 1); }
      }, 120);
    }

    if (this.shieldEnergyDisc && this.shieldEnergyDisc.object3D) {
      const mat = this.shieldEnergyDisc.getObject3D('mesh');
      if (mat && mat.material) {
        const origOpacity = mat.material.opacity;
        mat.material.opacity = 0.9;
        setTimeout(() => {
          if (mat && mat.material) { mat.material.opacity = origOpacity; }
        }, 100);
      }
    }
  }
});
