// ---------------------------------------------------------------------------
// Interface de jeu (DOM) : barre de ressources, panneau de sélection
// contextuel, menu de construction, files de production, notifications.
// Le DOM est privilégié au canvas pour l'UI : cibles tactiles larges,
// accessibilité et zoom navigateur gratuits.
// ---------------------------------------------------------------------------

import {
  AGES, UNIT_TYPES, BUILDING_TYPES, TECHS, RESOURCE_ICONS,
} from './config.js';
import { formatNumber, formatTime, costLabel, canAfford } from './utils.js';

const el = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.nodes = {
      food: el('res-food'), wood: el('res-wood'), gold: el('res-gold'),
      pop: el('res-pop'), age: el('age-label'), ageBar: el('age-bar'),
      timer: el('game-timer'),
      selection: el('selection-panel'), commands: el('command-panel'),
      alerts: el('alerts'), buildMenu: el('build-menu'), modal: el('modal'),
      workerBar: el('worker-bar'), workerMenu: el('worker-menu'),
      workerList: el('worker-list'), autoWorkers: el('auto-workers'),
      workerCounts: {
        food: el('wk-food'), wood: el('wk-wood'), gold: el('wk-gold'),
        build: el('wk-build'), idle: el('wk-idle'),
      },
      bottombar: el('bottombar'),
      minimap: el('minimap'), hud: el('hud'),
    };
    this.lastValues = {};
    this.selectionSignature = '';
    this.hudTimer = 0;
    this.bind();
  }

  bind() {
    el('btn-menu').addEventListener('click', () => this.game.togglePause());
    el('btn-sound').addEventListener('click', () => this.game.toggleSound());
    el('btn-close-build').addEventListener('click', () => this.game.cancelBuild());

    // Barre des ouvriers : un appui sélectionne le groupe, 👷 ouvre le panneau.
    el('btn-workers').addEventListener('click', () => this.openWorkerMenu());
    el('btn-close-workers').addEventListener('click', () => this.closeWorkerMenu());
    this.nodes.workerBar.querySelectorAll('[data-task]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const task = chip.dataset.task;
        if (task === 'idle') this.game.focusIdleVillager();
        else this.game.selectWorkerGroup(task);
      });
    });
    this.nodes.autoWorkers.addEventListener('change', (e) => {
      this.game.setAutoWorkers(e.target.checked);
      this.renderWorkerRows();
    });

    const minimap = this.nodes.minimap;
    const handleMinimap = (e) => {
      const rect = minimap.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      this.game.minimapJump(nx, ny);
    };
    minimap.addEventListener('pointerdown', (e) => {
      minimap.setPointerCapture?.(e.pointerId);
      this.minimapDragging = true;
      handleMinimap(e);
    });
    minimap.addEventListener('pointermove', (e) => { if (this.minimapDragging) handleMinimap(e); });
    minimap.addEventListener('pointerup', () => { this.minimapDragging = false; });
    minimap.addEventListener('pointercancel', () => { this.minimapDragging = false; });
  }

  // --- Rafraîchissement périodique -----------------------------------------

  update(dt) {
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.1;           // 10 Hz : largement assez pour du texte
    const player = this.world.players[this.world.humanIndex];
    this.setText('food', this.nodes.food, formatNumber(player.resources.food));
    this.setText('wood', this.nodes.wood, formatNumber(player.resources.wood));
    this.setText('gold', this.nodes.gold, formatNumber(player.resources.gold));
    this.setText('pop', this.nodes.pop, `${player.pop}/${player.popCap}`);
    this.nodes.pop.classList.toggle('warn', player.pop >= player.popCap);

    const ageName = AGES[player.age].name;
    if (player.ageProgress) {
      const ratio = 1 - player.ageProgress.timeLeft / player.ageProgress.total;
      this.setText('age', this.nodes.age, `${AGES[player.age + 1].name}…`);
      this.nodes.ageBar.style.width = `${Math.round(ratio * 100)}%`;
      this.nodes.ageBar.parentElement.classList.remove('hidden');
    } else {
      this.setText('age', this.nodes.age, ageName);
      this.nodes.ageBar.parentElement.classList.add('hidden');
    }
    this.setText('timer', this.nodes.timer, formatTime(this.world.time));

    this.refreshWorkerBar();
    this.refreshSelection();
    this.refreshDisabledStates();
    if (!this.nodes.workerMenu.classList.contains('hidden')) this.renderWorkerRows();
  }

  // --- Ouvriers -------------------------------------------------------------

  refreshWorkerBar() {
    const stats = this.game.workerStats();
    for (const task of ['food', 'wood', 'gold', 'build', 'idle']) {
      this.setText('wk' + task, this.nodes.workerCounts[task], String(stats[task] || 0));
    }
    this.nodes.workerBar.querySelector('[data-task="idle"]')
      .classList.toggle('has-idle', (stats.idle || 0) > 0);
  }

  openWorkerMenu() {
    this.nodes.autoWorkers.checked = this.game.autoWorkers();
    this.renderWorkerRows();
    this.nodes.workerMenu.classList.remove('hidden');
  }

  closeWorkerMenu() { this.nodes.workerMenu.classList.add('hidden'); }

  renderWorkerRows() {
    const stats = this.game.workerStats();
    const rows = [
      { task: 'food', icon: '🍖', name: 'Nourriture', hint: 'buissons et fermes', assignable: true },
      { task: 'wood', icon: '🪵', name: 'Bois', hint: 'forêts', assignable: true },
      { task: 'gold', icon: '🪙', name: 'Or', hint: 'filons', assignable: true },
      { task: 'build', icon: '🏗️', name: 'Chantiers', hint: 'en construction', assignable: false },
      { task: 'idle', icon: '💤', name: 'Sans affectation', hint: 'en attente d’ordres', assignable: false },
    ];
    const html = rows.map((row) => {
      const count = stats[row.task] || 0;
      const controls = row.assignable
        ? `<button class="wr-btn" data-take="${row.task}" ${count === 0 ? 'disabled' : ''}>−</button>
           <span class="wr-count">${count}</span>
           <button class="wr-btn" data-give="${row.task}">+</button>`
        : `<span class="wr-count">${count}</span>`;
      return `<div class="worker-row">
        <button class="wr-label" data-select="${row.task}">
          <span class="wr-icon">${row.icon}</span>
          <span>
            <span class="wr-name">${row.name}</span>
            <span class="wr-hint">${row.hint}</span>
          </span>
        </button>
        <div class="wr-controls">${controls}</div>
      </div>`;
    }).join('');
    const moving = stats.move || 0;
    this.nodes.workerList.innerHTML = html
      + (moving > 0 ? `<div class="wr-hint" style="padding-left:4px">${moving} en déplacement</div>` : '');

    this.nodes.workerList.querySelectorAll('[data-give]').forEach((btn) => {
      btn.addEventListener('click', () => { this.game.assignWorker(btn.dataset.give); this.renderWorkerRows(); });
    });
    this.nodes.workerList.querySelectorAll('[data-take]').forEach((btn) => {
      btn.addEventListener('click', () => { this.game.unassignWorker(btn.dataset.take); this.renderWorkerRows(); });
    });
    this.nodes.workerList.querySelectorAll('[data-select]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.selectWorkerGroup(btn.dataset.select);
        this.closeWorkerMenu();
      });
    });
  }

  /** La barre des ouvriers se cale au-dessus du panneau du bas, dont la hauteur varie. */
  measureBottomBar() {
    const height = this.nodes.bottombar.offsetHeight;
    if (height && height !== this.lastBottomHeight) {
      this.lastBottomHeight = height;
      document.documentElement.style.setProperty('--bottom-height', height + 6 + 'px');
    }
  }

  setText(key, node, value) {
    if (!node || this.lastValues[key] === value) return;
    this.lastValues[key] = value;
    node.textContent = value;
  }

  // --- Sélection ------------------------------------------------------------

  /** Signature légère : évite de reconstruire le DOM à chaque image. */
  signature(selection) {
    if (selection.length === 0) return 'none';
    const counts = {};
    for (const e of selection) counts[e.type] = (counts[e.type] || 0) + 1;
    const first = selection[0];
    const queue = first.kind === 'building'
      ? first.queue.map((q) => q.id + Math.ceil(q.timeLeft)).join(',') : '';
    return Object.entries(counts).map(([k, v]) => k + v).join('|')
      + '#' + selection.length + '#' + Math.round(first.hp) + '#' + queue
      + '#' + (first.complete === false ? Math.round(first.progressRatio * 20) : '')
      + '#' + this.world.players[this.world.humanIndex].age;
  }

  refreshSelection(force = false) {
    const selection = this.game.selection.filter((e) => !e.dead);
    const signature = this.signature(selection);
    if (!force && signature === this.selectionSignature) return;
    this.selectionSignature = signature;

    if (selection.length === 0) {
      this.nodes.selection.innerHTML = '<div class="hint">Touchez une unité pour la sélectionner · appui long pour un rectangle</div>';
      this.nodes.commands.innerHTML = '';
      this.commandNodes = [];
      this.commandButtons = [];
      this.measureBottomBar();
      return;
    }
    this.renderSelectionPanel(selection);
    this.renderCommands(selection);
    this.measureBottomBar();
  }

  renderSelectionPanel(selection) {
    const node = this.nodes.selection;
    const first = selection[0];
    const mine = first.playerIndex === this.world.humanIndex;

    if (selection.length === 1) {
      const def = first.def;
      const rows = [];
      if (first.kind === 'unit') {
        rows.push(`⚔️ ${def.attack} · 🛡️ ${first.meleeArmor()}/${first.pierceArmor()}`);
        if (def.range > 1.5) rows.push(`🎯 portée ${def.range}`);
        if (first.isVillager && first.carry.amount > 0.5) {
          rows.push(`${RESOURCE_ICONS[first.carry.type]} ${Math.floor(first.carry.amount)}/${first.carryCapacity()}`);
        }
      } else {
        if (def.attack) rows.push(`⚔️ ${def.attack} · 🎯 ${def.range}`);
        if (def.popBonus) rows.push(`👥 +${def.popBonus}`);
        if (first.type === 'farm') rows.push(`🍖 ${Math.max(0, Math.round(first.foodLeft))}`);
        if (!first.complete) rows.push(`🏗️ ${Math.round(first.progressRatio * 100)} %`);
      }
      node.innerHTML = `
        <div class="portrait" style="--team:${first.player.color.main}">${def.icon}</div>
        <div class="info">
          <div class="name">${def.name}${mine ? '' : ' <span class="enemy">(ennemi)</span>'}</div>
          <div class="hp"><span style="width:${Math.round((first.hp / first.maxHp) * 100)}%"></span></div>
          <div class="stats">❤️ ${Math.ceil(first.hp)}/${first.maxHp} · ${rows.join(' · ')}</div>
        </div>`;
      if (first.kind === 'building' && first.queue.length > 0) {
        node.insertAdjacentHTML('beforeend', this.renderQueue(first));
      }
      return;
    }

    const counts = {};
    for (const e of selection) counts[e.type] = (counts[e.type] || 0) + 1;
    const chips = Object.entries(counts).map(([type, count]) => {
      const def = UNIT_TYPES[type] || BUILDING_TYPES[type];
      return `<button class="chip" data-filter="${type}">${def.icon}<span>${count}</span></button>`;
    }).join('');
    node.innerHTML = `<div class="multi"><div class="multi-title">${selection.length} unités sélectionnées</div>
      <div class="chips">${chips}</div></div>`;
    node.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => this.game.filterSelection(btn.dataset.filter));
    });
  }

  renderQueue(building) {
    const items = building.queue.map((item, index) => {
      const def = UNIT_TYPES[item.id] || TECHS[item.id];
      const ratio = 1 - item.timeLeft / item.total;
      return `<button class="queue-item" data-cancel="${index}" title="Annuler">
        <span class="qicon">${def.icon}</span>
        <span class="qbar"><span style="width:${Math.round(ratio * 100)}%"></span></span>
      </button>`;
    }).join('');
    return `<div class="queue">${items}</div>`;
  }

  renderCommands(selection) {
    const node = this.nodes.commands;
    const first = selection[0];
    this.commandNodes = [];
    this.commandButtons = [];
    if (first.playerIndex !== this.world.humanIndex) { node.innerHTML = ''; return; }

    const buttons = [];
    const units = selection.filter((e) => e.kind === 'unit');
    const villagers = units.filter((u) => u.isVillager);
    const military = units.filter((u) => !u.isVillager);

    if (villagers.length > 0) {
      buttons.push({ icon: '🏗️', label: 'Construire', action: () => this.game.openBuildMenu() });
    }
    if (units.length > 0) {
      buttons.push({ icon: '✋', label: 'Stop', action: () => this.game.stopSelection() });
    }
    if (military.length > 0) {
      buttons.push({
        icon: '🎯', label: 'Attaquer ici', toggled: this.game.attackMoveArmed,
        action: () => this.game.toggleAttackMove(),
      });
    }

    if (first.kind === 'building' && selection.length === 1) {
      const b = first;
      if (!b.complete) {
        buttons.push({ icon: '❌', label: 'Annuler', action: () => this.game.cancelConstruction(b) });
      } else {
        const def = b.def;
        for (const unitType of def.trains || []) {
          const u = UNIT_TYPES[unitType];
          buttons.push({
            icon: u.icon, label: u.name, cost: costLabel(u.cost), time: u.trainTime,
            check: () => this.world.canTrain(b, unitType),
            action: () => this.game.trainUnit(b, unitType),
          });
        }
        for (const techId of def.techs || []) {
          const tech = TECHS[techId];
          if (this.world.players[this.world.humanIndex].techs.has(techId)) continue;
          buttons.push({
            icon: tech.icon, label: tech.name, cost: costLabel(tech.cost),
            check: () => this.world.canResearch(b, techId),
            action: () => this.game.researchTech(b, techId),
          });
        }
        if (b.type === 'towncenter') {
          const player = this.world.players[this.world.humanIndex];
          for (const techId of ['wheelbarrow']) {
            if (player.techs.has(techId) || TECHS[techId].age > player.age) continue;
            const tech = TECHS[techId];
            buttons.push({
              icon: tech.icon, label: tech.name, cost: costLabel(tech.cost),
              check: () => this.world.canResearch(b, techId),
              action: () => this.game.researchTech(b, techId),
            });
          }
          const next = AGES[player.age + 1];
          if (next) {
            buttons.push({
              icon: '⏫', label: next.name, cost: costLabel(next.cost), highlight: true,
              check: () => this.world.canAdvanceAge(b),
              action: () => this.game.advanceAge(b),
            });
          }
        }
        if (def.trains) {
          buttons.push({
            icon: '🚩', label: 'Ralliement', toggled: this.game.rallyArmed,
            action: () => this.game.toggleRally(),
          });
        }
        buttons.push({ icon: '🗑️', label: 'Détruire', action: () => this.game.demolish(b) });
      }
    }

    node.innerHTML = buttons.map((b, i) => {
      const state = b.check ? b.check() : { ok: true };
      const classes = ['cmd'];
      if (!state.ok) classes.push('disabled');
      if (b.toggled) classes.push('toggled');
      if (b.highlight) classes.push('highlight');
      return `<button class="${classes.join(' ')}" data-cmd="${i}" ${state.ok ? '' : `data-reason="${state.reason}"`}>
        <span class="cmd-icon">${b.icon}</span>
        <span class="cmd-label">${b.label}</span>
        ${b.cost ? `<span class="cmd-cost">${b.cost}</span>` : ''}
      </button>`;
    }).join('');

    this.commandButtons = buttons;
    this.commandNodes = [...node.querySelectorAll('[data-cmd]')];
    this.commandNodes.forEach((btn) => {
      const command = buttons[Number(btn.dataset.cmd)];
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) {
          this.toast(btn.dataset.reason || 'Indisponible', 'error');
          this.game.audio.play('error');
          return;
        }
        this.game.audio.play('click');
        command.action();
        this.refreshSelection(true);
      });
    });

    const queue = this.nodes.selection.querySelectorAll('[data-cancel]');
    queue.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.world.cancelProduction(first, Number(btn.dataset.cancel));
        this.refreshSelection(true);
      });
    });
  }

/** Grise en direct ce qui n'est plus payable — sans reconstruire le panneau,
   *  pour ne pas recréer les boutons sous le doigt du joueur. */
  refreshDisabledStates() {
    if (!this.commandNodes || this.commandNodes.length === 0) return;
    for (const btn of this.commandNodes) {
      const command = this.commandButtons[Number(btn.dataset.cmd)];
      if (!command || !command.check) continue;
      const state = command.check();
      btn.classList.toggle('disabled', !state.ok);
      if (state.reason) btn.dataset.reason = state.reason;
    }
  }

  // --- Menu de construction -------------------------------------------------

  openBuildMenu() {
    const player = this.world.players[this.world.humanIndex];
    const list = el('build-list');
    const available = Object.values(BUILDING_TYPES).filter((def) => (def.age || 0) <= player.age);
    list.innerHTML = available.map((def) => {
      const affordable = canAfford(player.resources, def.cost);
      const requires = def.requires && !this.world.buildings.some(
        (b) => b.playerIndex === player.index && b.type === def.requires && b.complete && !b.dead);
      const limited = def.limit && this.world.buildings.filter(
        (b) => b.playerIndex === player.index && b.type === def.type && !b.dead).length >= def.limit;
      const disabled = !affordable || requires || limited;
      let reason = '';
      if (requires) reason = `Nécessite : ${BUILDING_TYPES[def.requires].name}`;
      else if (limited) reason = 'Nombre maximum atteint';
      else if (!affordable) reason = 'Ressources insuffisantes';
      return `<button class="build-card ${disabled ? 'disabled' : ''}" data-type="${def.id}" data-reason="${reason}">
        <span class="bc-icon">${def.icon}</span>
        <span class="bc-body">
          <span class="bc-name">${def.name}</span>
          <span class="bc-desc">${def.desc}</span>
        </span>
        <span class="bc-cost">${costLabel(def.cost)}</span>
      </button>`;
    }).join('');
    list.querySelectorAll('[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) {
          this.toast(btn.dataset.reason || 'Indisponible', 'error');
          this.game.audio.play('error');
          return;
        }
        this.game.startBuildMode(btn.dataset.type);
      });
    });
    this.nodes.buildMenu.classList.remove('hidden');
  }

  closeBuildMenu() { this.nodes.buildMenu.classList.add('hidden'); }

  setBuildHint(text) {
    const hint = el('build-hint');
    hint.textContent = text || '';
    hint.classList.toggle('hidden', !text);
  }

  // --- Notifications --------------------------------------------------------

  toast(message, kind = 'info') {
    // Message identique déjà affiché : on incrémente plutôt que d'empiler.
    const last = this.nodes.alerts.lastElementChild;
    if (last && last.dataset.message === message && !last.classList.contains('leaving')) {
      const count = Number(last.dataset.count || 1) + 1;
      last.dataset.count = count;
      last.innerHTML = `${message} <span class="toast-count">×${count}</span>`;
      return;
    }
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.dataset.message = message;
    node.textContent = message;
    this.nodes.alerts.appendChild(node);
    setTimeout(() => {
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 400);
    }, 2600);
    while (this.nodes.alerts.children.length > 4) this.nodes.alerts.firstChild.remove();
  }

  // --- Fenêtres modales -----------------------------------------------------

  showModal(html, options = {}) {
    this.nodes.modal.innerHTML = `<div class="modal-card ${options.wide ? 'wide' : ''}">${html}</div>`;
    this.nodes.modal.classList.remove('hidden');
    return this.nodes.modal;
  }

  hideModal() { this.nodes.modal.classList.add('hidden'); this.nodes.modal.innerHTML = ''; }

  showPause() {
    const modal = this.showModal(`
      <h2>Partie en pause</h2>
      <div class="modal-actions">
        <button class="btn primary" data-act="resume">Reprendre</button>
        <button class="btn" data-act="help">Comment jouer</button>
        <button class="btn danger" data-act="resign">Abandonner</button>
      </div>`);
    modal.querySelector('[data-act="resume"]').addEventListener('click', () => this.game.togglePause());
    modal.querySelector('[data-act="help"]').addEventListener('click', () => this.showHelp());
    modal.querySelector('[data-act="resign"]').addEventListener('click', () => this.game.resign());
  }

  showHelp() {
    const modal = this.showModal(`
      <h2>Comment jouer</h2>
      <ul class="help">
        <li><b>Glisser</b> : déplacer la vue · <b>pincer</b> : zoomer</li>
        <li><b>Toucher</b> une unité : la sélectionner · <b>double tap</b> : toutes les unités du même type visibles</li>
        <li><b>Appui long puis glisser</b> : sélection rectangulaire</li>
        <li>Avec une sélection, <b>toucher</b> le sol, un arbre, une mine ou un ennemi donne l'ordre correspondant</li>
        <li><b>🏗️ Construire</b> : choisissez un bâtiment, puis touchez l'emplacement</li>
        <li>Les villageois récoltent 🍖 nourriture, 🪵 bois et 🪙 or ; il faut des <b>maisons</b> pour agrandir la population</li>
        <li><b>C'est vous qui affectez vos ouvriers</b> : quand un gisement s'épuise, le villageois rapporte son chargement puis attend vos ordres. La barre <b>👷</b> montre qui fait quoi et permet de réaffecter d'un doigt</li>
        <li>Passez les <b>âges</b> depuis le Centre-Ville pour débloquer de nouvelles unités</li>
        <li><b>Objectif</b> : détruire tous les bâtiments adverses et leurs villageois</li>
      </ul>
      <div class="modal-actions"><button class="btn primary" data-act="close">J'ai compris</button></div>`, { wide: true });
    modal.querySelector('[data-act="close"]').addEventListener('click', () => {
      if (this.game.paused) this.showPause(); else this.hideModal();
    });
  }

  showGameOver(result) {
    const player = this.world.players[this.world.humanIndex];
    const enemy = this.world.players[1 - this.world.humanIndex];
    const title = result.victory ? '🏆 Victoire !' : '💀 Défaite';
    const summary = `
      <table class="scores">
        <tr><th></th><th>Vous</th><th>Adversaire</th></tr>
        <tr><td>Ressources récoltées</td>
            <td>${formatNumber(this.total(player))}</td><td>${formatNumber(this.total(enemy))}</td></tr>
        <tr><td>Unités formées</td><td>${player.stats.trained}</td><td>${enemy.stats.trained}</td></tr>
        <tr><td>Unités perdues</td><td>${player.stats.lost}</td><td>${enemy.stats.lost}</td></tr>
        <tr><td>Bâtiments construits</td><td>${player.stats.built}</td><td>${enemy.stats.built}</td></tr>
        <tr><td>Âge atteint</td><td>${AGES[player.age].name}</td><td>${AGES[enemy.age].name}</td></tr>
      </table>`;
    const modal = this.showModal(`
      <h2>${title}</h2>
      <p class="subtitle">Durée de la partie : ${formatTime(result.time)}</p>
      ${summary}
      <div class="modal-actions">
        <button class="btn primary" data-act="again">Nouvelle partie</button>
        <button class="btn" data-act="menu">Menu principal</button>
      </div>`, { wide: true });
    modal.querySelector('[data-act="again"]').addEventListener('click', () => this.game.restart());
    modal.querySelector('[data-act="menu"]').addEventListener('click', () => this.game.quitToMenu());
  }

  total(player) {
    const g = player.stats.gathered;
    return g.food + g.wood + g.gold;
  }
}
