const COLORS = require('../constants/colors.js');

const iconPositions = {
  shieldvr: 1.20,
  gunvr: 0.72,
  drumvr: 0.24,
  punchvr: -0.24,
  classicvr: -0.72,
  ridevr: -1.20
};

const modeMap = {
  shieldvr: 'shield',
  gunvr: 'gun',
  drumvr: 'drum',
  punchvr: 'punch',
  classicvr: 'classic',
  ridevr: 'ride'
};

AFRAME.registerComponent('menu-mode', {
  schema: {
    colorScheme: {default: 'default'},
    hasVR: {default: false}
  },

  init: function () {
    this.el.addEventListener('click', evt => {
      const item = evt.target.closest('[data-mode]');
      if (!item) { return; }
      const mode = item.dataset.mode;
      const name = item.dataset.name;
      this.el.sceneEl.emit('gamemode', mode, false);
      localStorage.setItem('gameMode', name);
      this.setModeOption(name);
    });
  },

  update: function () {
    const selectedMode = localStorage.getItem('gameMode') || 'gunvr';
    this.setModeOption(selectedMode);
    this.el.sceneEl.emit('gamemode', modeMap[selectedMode] || 'gun');
  },

  setModeOption: function (name) {
    const modeEls = this.el.querySelectorAll('.modeItem');
    document.getElementById('modeIcon').object3D.position.y = iconPositions[name];

    for (let i = 0; i < modeEls.length; i++) {
      const modeEl = modeEls[i];
      const selected = modeEl.dataset.name === name;

      modeEl.emit(selected ? 'select' : 'deselect', null, false);

      const background = modeEl.querySelector('.modeBackground');
      background.emit(selected ? 'select' : 'deselect', null, false);
      background.setAttribute(
        'mixin',
        'modeBackgroundSelect' + (selected ? '' : ' modeBackgroundHover'));

      const thumb = modeEl.querySelector('.modeThumb');
      thumb.emit(selected ? 'select' : 'deselect', null, false);

      const title = modeEl.querySelector('.modeTitle');
      title.setAttribute(
        'text', 'color',
        selected ? COLORS.WHITE : COLORS.schemes[this.data.colorScheme].secondary);

      const instructions = modeEl.querySelector('.modeInstructions');
      instructions.setAttribute(
        'text', 'color',
        selected ? COLORS.WHITE : COLORS.schemes[this.data.colorScheme].primary);
    }
  }
});
