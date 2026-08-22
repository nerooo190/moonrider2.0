/**
 * Floating Virtual Drum Kit & Web Audio Drum Synthesizer for Drum Mode.
 */

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

// Noise buffer for snare and cymbals
let noiseBuffer = null;
function getNoiseBuffer (ctx) {
  if (!noiseBuffer && ctx) {
    const bufferSize = ctx.sampleRate * 1.5;
    noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }
  return noiseBuffer;
}

AFRAME.registerComponent('drums', {
  schema: {
    enabled: { default: false }
  },

  init: function () {
    this.pads = {};
    this.padEls = this.el.querySelectorAll('.drumPad');
    this.beatSystem = null;
    this.curveFollowRig = document.getElementById('curveFollowRig');

    for (let i = 0; i < this.padEls.length; i++) {
      const padEl = this.padEls[i];
      const type = padEl.dataset.drumType;
      this.pads[type] = {
        el: padEl,
        surfaceEl: padEl.querySelector('.padSurface'),
        glowEl: padEl.querySelector('.padGlow'),
        bbox: new THREE.Box3(),
        worldPos: new THREE.Vector3(),
        hitTime: 0
      };
    }
  },

  play: function () {
    this.beatSystem = this.el.sceneEl.components['beat-system'];
  },

  tick: function (time, delta) {
    if (!this.data.enabled) { return; }

    // Update pad bounding boxes in world space
    for (const key in this.pads) {
      const pad = this.pads[key];
      pad.el.object3D.getWorldPosition(pad.worldPos);
      pad.bbox.setFromObject(pad.el.object3D);
      pad.bbox.expandByScalar(0.08);

      if (pad.hitTime > 0) {
        pad.hitTime -= delta;
        if (pad.hitTime <= 0) {
          if (pad.glowEl) { pad.glowEl.object3D.visible = false; }
          pad.surfaceEl.object3D.scale.set(1, 1, 1);
        }
      }
    }
  },

  hitPad: function (type, hand, stickPos, strikeSpeed) {
    const pad = this.pads[type];
    if (!pad) { return; }

    // Pad visual strike feedback
    pad.hitTime = 120;
    if (pad.glowEl) { pad.glowEl.object3D.visible = true; }
    if (pad.surfaceEl) {
      pad.surfaceEl.object3D.scale.set(1.18, 1.18, 1.18);
    }

    // Play procedural drum sound
    this.playDrumSound(type, strikeSpeed);

    // Check rhythm beat hit corresponding to this drum pad
    this.checkBeatHitOnPad(type, hand);
  },

  checkBeatHitOnPad: function (drumType, hand) {
    if (!this.beatSystem) {
      this.beatSystem = this.el.sceneEl.components['beat-system'];
      if (!this.beatSystem) { return; }
    }

    const activeBeats = this.beatSystem.beats;
    if (!activeBeats || !activeBeats.length) { return; }

    const pad = this.pads[drumType];
    if (!pad) { return; }

    // Lane mapping for drums:
    // hihat: 0 (left), snare: 1 (middleleft), kick: bottom/middle, tom: 2 (middleright), cymbal: 3 (right)
    const laneMap = {
      hihat: ['left'],
      snare: ['middleleft', 'left'],
      kick: ['middleleft', 'middleright', 'middle'],
      tom: ['middleright', 'middle'],
      cymbal: ['right', 'middleright']
    };

    const targetLanes = laneMap[drumType] || [];
    const expectedColor = hand === 'left' ? 'red' : 'blue';

    const padPos = pad.worldPos;
    let bestBeat = null;
    let closestDist = Infinity;

    for (let i = 0; i < activeBeats.length; i++) {
      const beat = activeBeats[i];
      if (beat.destroyed || !beat.el.object3D.visible) { continue; }

      // Check if beat matches lane or is close to pad
      const beatWorldPos = beat.el.object3D.getWorldPosition(new THREE.Vector3());
      const dist = beatWorldPos.distanceTo(padPos);

      // Hit window: within 0.95m of the drum pad
      if (dist < 0.95) {
        const laneMatches = targetLanes.indexOf(beat.horizontalPosition) !== -1;
        if (laneMatches || dist < 0.6) {
          if (dist < closestDist) {
            closestDist = dist;
            bestBeat = beat;
          }
        }
      }
    }

    if (bestBeat) {
      // Mine
      if (bestBeat.data.type === 'mine') {
        bestBeat.destroyBeat(this.el, false);
        this.el.sceneEl.emit('minehit', null, true);
        return;
      }

      // Color check
      const correctColor = bestBeat.data.color === expectedColor;
      if (!correctColor) {
        bestBeat.onHit(this.el, true);
        bestBeat.destroyBeat(this.el, false);
        return;
      }

      // Valid rhythm drum hit!
      bestBeat.destroyBeat(this.el, true);

      // Calculate score based on distance to pad center (precision)
      const base = 60;
      const precisionScore = Math.max(0, 1 - (closestDist / 0.95)) * 40;
      const score = Math.min(100, Math.round(base + precisionScore));
      bestBeat.score(score, score);

      if (bestBeat.el.parentNode && bestBeat.el.parentNode.components['beat-hit-sound']) {
        bestBeat.el.parentNode.components['beat-hit-sound'].playSound(bestBeat.el, bestBeat.cutDirection);
      }
    }
  },

  playDrumSound: function (type, strikeSpeed) {
    try {
      const ctx = getAudioContext();
      if (!ctx) { return; }

      const now = ctx.currentTime;
      const gainFactor = Math.min(1.2, Math.max(0.4, (strikeSpeed || 3.0) / 4.0));

      if (type === 'kick') {
        // Kick Drum: Deep punchy sub-bass sine drop
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.12);

        gain.gain.setValueAtTime(0.75 * gainFactor, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);

      } else if (type === 'snare') {
        // Snare Drum: Tone + White Noise snap
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(210, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
        oscGain.gain.setValueAtTime(0.4 * gainFactor, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);

        const noise = ctx.createBufferSource();
        noise.buffer = getNoiseBuffer(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.45 * gainFactor, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + 0.2);

      } else if (type === 'tom' || type === 'tom1' || type === 'tom2') {
        // Toms: Descending resonant pitch
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const startPitch = type === 'tom1' ? 190 : 135;
        osc.frequency.setValueAtTime(startPitch, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);
        gain.gain.setValueAtTime(0.6 * gainFactor, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);

      } else if (type === 'hihat' || type === 'cymbal') {
        // Hi-Hat / Cymbal: Metallic noise through bandpass filter
        const noise = ctx.createBufferSource();
        noise.buffer = getNoiseBuffer(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = type === 'hihat' ? 8000 : 5500;
        filter.Q.value = 3.5;
        const gain = ctx.createGain();
        const duration = type === 'hihat' ? 0.08 : 0.45;
        gain.gain.setValueAtTime(0.35 * gainFactor, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + duration + 0.05);
      }
    } catch (e) {}
  }
});
