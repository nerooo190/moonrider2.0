/**
 * Drumstick weapon component for Drum Mode.
 * Tracks tip position, velocity, detects pad collisions, triggers haptics and strikes.
 */

AFRAME.registerComponent('drumstick', {
  schema: {
    enabled: { default: false },
    hand: { default: 'right', oneOf: ['left', 'right'] }
  },

  init: function () {
    this.tipPos = new THREE.Vector3();
    this.lastTipPos = new THREE.Vector3();
    this.tipVelocity = new THREE.Vector3();
    this.strikeSpeed = 0;
    this.lastSampleTime = 0;
    this.drumsComponent = null;

    this.tipEl = this.el.querySelector('.drumstickTip');

    // Dummy properties for beat-system compatibility
    this.bbox = new THREE.Box3();
    this.speed = 10;
    this.strokeSpeed = 10;
  },

  play: function () {
    const drumsEl = document.getElementById('floatingDrums');
    if (drumsEl) {
      this.drumsComponent = drumsEl.components.drums;
    }
  },

  tick: function (time, delta) {
    if (!this.data.enabled) { return; }

    if (!this.drumsComponent) {
      const drumsEl = document.getElementById('floatingDrums');
      if (drumsEl) {
        this.drumsComponent = drumsEl.components.drums;
      }
    }

    if (this.tipEl) {
      this.tipEl.object3D.getWorldPosition(this.tipPos);
    } else {
      this.el.object3D.getWorldPosition(this.tipPos);
      this.tipPos.y += 0.15;
    }

    // Calculate tip velocity (m/s)
    if (this.lastSampleTime > 0 && delta > 0) {
      this.tipVelocity.copy(this.tipPos).sub(this.lastTipPos);
      this.strikeSpeed = this.tipVelocity.length() / (delta / 1000);
    }
    this.lastTipPos.copy(this.tipPos);
    this.lastSampleTime = time;

    // Check pad collisions
    this.checkPadCollisions();
  },

  checkPadCollisions: function () {
    if (!this.drumsComponent || !this.drumsComponent.pads) { return; }

    const pads = this.drumsComponent.pads;
    const tip = this.tipPos;

    for (const key in pads) {
      const pad = pads[key];
      if (pad.bbox.containsPoint(tip)) {
        // Strike if moving or inside pad
        if (pad.hitTime <= 0) {
          this.drumsComponent.hitPad(key, this.data.hand, tip, this.strikeSpeed);

          // Haptic rumble
          try {
            if (this.el.components.haptics__beat) {
              this.el.components.haptics__beat.pulse();
            } else if (this.el.components.haptics) {
              this.el.components.haptics.pulse();
            }
          } catch (e) {}
        }
      }
    }
  },

  tickBeatSystem: function () {
    // Called by beat-system tick
  },

  checkCollision: function (beat) {
    // Handled via drum pads & drums component
    return false;
  }
});
