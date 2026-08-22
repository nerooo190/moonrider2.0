const COLORS = require('../constants/colors.js');

const iconPositions = {
  gunvr: 0.87,
  punchvr: 0.15,
  classicvr: -0.6,
  ridevr: -1.35,
  ride2d: 0.87,
  viewer2d: 0.15
};

const modeMap = {
  gunvr: 'gun',
  punchvr: 'punch',
  classicvr: 'classic',
  ridevr: 'ride',
  ride2d: 'ride',
  viewer2d: 'viewer'
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
