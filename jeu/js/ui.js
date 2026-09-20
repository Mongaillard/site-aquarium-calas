// ---------------------------------------------------------------------------
// Interface de jeu (DOM) : barre de ressources, panneau de sélection
// contextuel, menu de construction, files de production, notifications.
// Le DOM est privilégié au canvas pour l'UI : cibles tactiles larges,
// accessibilité et zoom navigateur gratuits.
// ---------------------------------------------------------------------------

import {
  AGES, UNIT_TYPES, BUILDING_TYPES, TECHS, RESOURCE_ICONS, STANCES, GAME_SPEEDS, PORTRAITS,
} from './config.js';
import { formatNumber, formatTime, costLabel, canAfford } from './utils.js';
import { iconeSVG, ICONES_LICENCE } from './icones.js';

const el = (id) => document.getElementById(id);

/** Icône en ligne dans une phrase, calée sur la taille du texte. */
const ic = (cle) => iconeSVG(cle, 13, 'inline');

/** Remplace les marqueurs de coût (`<i data-cout="wood">`) par leur pictogramme. */
function poserIconesDeCout(racine) {
  for (const marqueur of racine.querySelectorAll('[data-cout]')) {
    marqueur.innerHTML = iconeSVG(marqueur.dataset.cout, 12, 'inline');
  }
}

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
    this.commandsSignature = '';   // les boutons ne se reconstruisent que si leur liste change
    this.workerRows = null;        // lignes du panneau d'affectation, construites une fois
    this.hudTimer = 0;
    this.bind();
  }

  bind() {
    // Pictogrammes fixes du HUD (ressources, boutons) : posés une fois ici,
    // plutôt qu'écrits en dur dans le HTML — une seule source pour les icônes.
    for (const node of document.querySelectorAll('[data-icone]')) {
      node.innerHTML = iconeSVG(node.dataset.icone, node.classList.contains('icon-btn') ? 19 : 17);
    }

    el('btn-menu').addEventListener('click', () => this.game.togglePause());
    el('btn-sound').addEventListener('click', () => this.game.toggleSound());
    el('btn-close-build').addEventListener('click', () => this.game.cancelBuild());

    // Barre des ouvriers : un appui sélectionne le groupe, le bouton ouvre le panneau.
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
    // Partie limitée dans le temps : c'est le temps qui reste qui compte.
    const limite = this.world.mode.timeLimit || 0;
    this.setText('timer', this.nodes.timer, limite
      ? formatTime(Math.max(0, limite - this.world.time))
      : formatTime(this.world.time));
    this.nodes.timer.classList.toggle('urgent', limite > 0 && limite - this.world.time < 60);

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
    this.renderWorkerRows(true);
    this.nodes.workerMenu.classList.remove('hidden');
  }

  closeWorkerMenu() { this.nodes.workerMenu.classList.add('hidden'); }

  /**
   * Le panneau se rafraîchit dix fois par seconde : on ne reconstruit le DOM
   * qu'à l'ouverture, et on ne remplace ensuite que les chiffres. Sinon les
   * boutons étaient détruits sous le doigt et un appui sur deux se perdait.
   */
  renderWorkerRows(rebuild = false) {
    const stats = this.game.workerStats();
    const sites = this.game.constructionSites().length;
    const rows = [
      { task: 'food', icon: 'food', name: 'Nourriture', hint: 'buissons et fermes', assignable: true },
      { task: 'wood', icon: 'wood', name: 'Bois', hint: 'forêts', assignable: true },
      { task: 'gold', icon: 'gold', name: 'Or', hint: 'filons', assignable: true },
      {
        task: 'build', icon: 'chantier', name: 'Chantiers', assignable: true, noSource: sites === 0,
        hint: sites > 0
          ? `${sites} chantier${sites > 1 ? 's' : ''} ouvert${sites > 1 ? 's' : ''}`
          : 'aucun chantier ouvert',
      },
      { task: 'idle', icon: 'idle', name: 'Sans affectation', hint: 'en attente d’ordres', assignable: false },
    ];

    if (rebuild || !this.workerRows) {
      this.nodes.workerList.innerHTML = rows.map((row) => `
        <div class="worker-row" data-row="${row.task}">
          <button class="wr-label" data-select="${row.task}">
            <span class="wr-icon">${iconeSVG(row.icon, 22)}</span>
            <span>
              <span class="wr-name">${row.name}</span>
              <span class="wr-hint">${row.hint}</span>
            </span>
          </button>
          <div class="wr-controls">${row.assignable
            ? `<button class="wr-btn" data-take="${row.task}">−</button>
               <span class="wr-count">0</span>
               <button class="wr-btn" data-give="${row.task}">+</button>`
            : '<span class="wr-count">0</span>'}</div>
        </div>`).join('') + '<div class="wr-hint" data-moving style="padding-left:4px"></div>';

      this.workerRows = {};
      for (const row of rows) {
        const node = this.nodes.workerList.querySelector(`[data-row="${row.task}"]`);
        this.workerRows[row.task] = {
          count: node.querySelector('.wr-count'),
          hint: node.querySelector('.wr-hint'),
          give: node.querySelector('[data-give]'),
          take: node.querySelector('[data-take]'),
        };
      }
      this.workerMoving = this.nodes.workerList.querySelector('[data-moving]');

      // Les écouteurs ne sont posés qu'une fois, sur des boutons qui ne
      // sont plus jamais remplacés.
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

    for (const row of rows) {
      const node = this.workerRows[row.task];
      const count = stats[row.task] || 0;
      node.count.textContent = String(count);
      node.hint.textContent = row.hint;
      if (node.take) node.take.disabled = count === 0;
      if (node.give) node.give.disabled = !!row.noSource;
    }
    const moving = stats.move || 0;
    this.workerMoving.textContent = moving > 0 ? `${moving} en déplacement` : '';
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
      + '#' + (first.stance || '') + '#' + (first.garrison ? first.garrison.length : '')
      + '#' + (first.buildQueue ? first.buildQueue.length : '')
      + '#' + (first.kind === 'building' && !first.complete ? this.world.buildersOn(first) : '')
      + '#' + (first.complete === false ? Math.round(first.progressRatio * 20) : '')
      + '#' + this.world.players[this.world.humanIndex].age;
  }

  /**
   * Signature des BOUTONS : uniquement ce qui change leur liste. Les PV, un
   * avancement de chantier ou une file de production évoluent en permanence —
   * s'ils entraînaient un nouveau rendu, le bouton disparaissait sous le doigt
   * et l'appui se perdait.
   */
  commandSignature(selection) {
    const player = this.world.players[this.world.humanIndex];
    const first = selection[0];
    return selection.map((e) => e.id + (e.stance || '')).join(',')
      + '#' + (first.kind === 'building' ? (first.complete ? 'fini' : 'chantier') : '')
      + '#' + (first.garrison ? first.garrison.length : '')
      + '#' + player.age + '#' + player.techs.size
      + '#' + [this.game.attackMoveArmed, this.game.garrisonArmed, this.game.rallyArmed].join('');
  }

  refreshSelection(force = false) {
    const selection = this.game.selection.filter((e) => !e.dead);
    const signature = this.signature(selection);
    const commands = selection.length > 0 ? this.commandSignature(selection) : 'none';
    if (!force && signature === this.selectionSignature && commands === this.commandsSignature) return;

    if (selection.length === 0) {
      if (this.selectionSignature !== 'none' || force) {
        this.nodes.selection.innerHTML = '<div class="hint">Touchez une unité pour la sélectionner · appui long pour un rectangle</div>';
        this.nodes.commands.innerHTML = '';
        this.commandNodes = [];
        this.commandButtons = [];
        this.measureBottomBar();
      }
      this.selectionSignature = signature;
      this.commandsSignature = commands;
      return;
    }
    if (force || signature !== this.selectionSignature) this.renderSelectionPanel(selection);
    if (force || commands !== this.commandsSignature) this.renderCommands(selection);
    this.selectionSignature = signature;
    this.commandsSignature = commands;
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
        rows.push(`${ic('aggressive')} ${def.attack} · ${ic('defensive')} ${first.meleeArmor()}/${first.pierceArmor()}`);
        rows.push(`${ic(first.stanceDef.icon)} ${first.stanceDef.name}`);
        if (first.buildQueue && first.buildQueue.length > 0) {
          rows.push(`${ic('chantier')} ${first.buildQueue.length} chantier(s) en file`);
        }
        if (def.range > 1.5) rows.push(`${ic('attaquer')} portée ${def.range}`);
        if (first.isVillager && first.carry.amount > 0.5) {
          rows.push(`${RESOURCE_ICONS[first.carry.type]} ${Math.floor(first.carry.amount)}/${first.carryCapacity()}`);
        }
      } else {
        if (def.attack) rows.push(`${ic('aggressive')} ${def.attack} · ${ic('attaquer')} ${def.range}`);
        if (def.popBonus) rows.push(`${ic('population')} +${def.popBonus}`);
        if (def.garrison) rows.push(`${ic('garrison')} ${first.garrison.length}/${def.garrison.capacity}`);
        if (first.type === 'farm') rows.push(`${ic('food')} ${Math.max(0, Math.round(first.foodLeft))}`);
        if (!first.complete) {
          rows.push(`${ic('chantier')} ${Math.round(first.progressRatio * 100)} %`);
          // On compte aussi ceux qui marchent vers le chantier : sinon le
          // renfort qu'on vient d'envoyer semble n'avoir servi à rien.
          const ouvriers = this.world.buildersOn(first);
          rows.push(ouvriers > 0
            ? `${ic('ouvriers')} ${ouvriers} ouvrier${ouvriers > 1 ? 's' : ''}`
            : `${ic('ouvriers')} aucun ouvrier — touchez le chantier avec des villageois`);
        }
      }
      node.innerHTML = `
        <div class="portrait${PORTRAITS[first.type] ? ' illustre' : ''}" style="--team:${first.player.color.main}">${
          PORTRAITS[first.type]
            // Un portrait peint est bleu : l'adversaire le porte en rouge, par
            // rotation de teinte — plutôt qu'une seconde image à télécharger.
            ? `<img src="${PORTRAITS[first.type]}" alt="" class="${mine ? '' : 'adverse'}">`
            : iconeSVG(def.icon, 30)}</div>
        <div class="info">
          <div class="name">${def.name}${mine ? '' : ' <span class="enemy">(ennemi)</span>'}</div>
          <div class="hp"><span style="width:${Math.round((first.hp / first.maxHp) * 100)}%"></span></div>
          <div class="stats">${ic('pointsDeVie')} ${Math.ceil(first.hp)}/${first.maxHp} · ${rows.join(' · ')}</div>
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
      return `<button class="chip" data-filter="${type}">${iconeSVG(def.icon, 17)}<span>${count}</span></button>`;
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
        <span class="qicon">${iconeSVG(def.icon, 17)}</span>
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
      buttons.push({ icon: 'chantier', label: 'Construire', action: () => this.game.openBuildMenu() });
    }
    if (units.length > 0) {
      buttons.push({ icon: 'stop', label: 'Stop', action: () => this.game.stopSelection() });
    }
    if (military.length > 0) {
      buttons.push({
        icon: 'attaquer', label: 'Attaquer ici', toggled: this.game.attackMoveArmed,
        action: () => this.game.toggleAttackMove(),
      });
    }
    if (units.length > 0 && this.world.buildings.some(
      (b) => !b.dead && b.complete && b.playerIndex === this.world.humanIndex
        && b.def.garrison && units.some((u) => b.canGarrison(u)))) {
      buttons.push({
        icon: 'garrison', label: 'Abriter', toggled: this.game.garrisonArmed,
        action: () => this.game.toggleGarrison(),
      });
    }
    if (units.length > 0) {
      // Attitudes, comme dans AoE : c'est elles qui décident si l'unité engage
      // d'elle-même et jusqu'où elle poursuit.
      const current = units.every((u) => u.stance === units[0].stance) ? units[0].stance : null;
      for (const stance of Object.values(STANCES)) {
        buttons.push({
          icon: stance.icon, label: stance.short, title: stance.name + ' — ' + stance.desc,
          compact: true, toggled: current === stance.id,
          action: () => this.game.setStance(stance.id),
        });
      }
    }

    if (first.kind === 'building' && selection.length === 1) {
      const b = first;
      if (!b.complete) {
        buttons.push({
          icon: 'ouvriers', label: '+1 ouvrier',
          check: () => (this.game.hasSpareWorker()
            ? { ok: true } : { ok: false, reason: 'Aucun villageois disponible' }),
          action: () => this.game.reinforceSite(b),
        });
        buttons.push({ icon: 'annuler', label: 'Annuler', action: () => this.game.cancelConstruction(b) });
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
              icon: 'ageUp', label: next.name, cost: costLabel(next.cost), highlight: true,
              check: () => this.world.canAdvanceAge(b),
              action: () => this.game.advanceAge(b),
            });
          }
        }
        if (def.garrison) {
          if (b.type === 'towncenter') {
            buttons.push({
              icon: 'cloche', label: 'Cloche', action: () => this.game.ringTownBell(),
            });
          }
          buttons.push({
            icon: 'sortir', label: `Libérer (${b.garrison.length})`,
            check: () => (b.garrison.length > 0 ? { ok: true } : { ok: false, reason: 'Personne à l’intérieur' }),
            action: () => this.game.releaseGarrison(b),
          });
        }
        if (def.trains) {
          buttons.push({
            icon: 'ralliement', label: 'Ralliement', toggled: this.game.rallyArmed,
            action: () => this.game.toggleRally(),
          });
        }
        buttons.push({ icon: 'detruire', label: 'Détruire', action: () => this.game.demolish(b) });
      }
    }

    node.innerHTML = buttons.map((b, i) => {
      const state = b.check ? b.check() : { ok: true };
      const classes = ['cmd'];
      if (!state.ok) classes.push('disabled');
      if (b.toggled) classes.push('toggled');
      if (b.highlight) classes.push('highlight');
      if (b.compact) classes.push('compact');
      const title = b.title ? ` title="${b.title}"` : '';
      return `<button class="${classes.join(' ')}" data-cmd="${i}"${title} ${state.ok ? '' : `data-reason="${state.reason}"`}>
        <span class="cmd-icon">${iconeSVG(b.icon, 22)}</span>
        <span class="cmd-label">${b.label}</span>
        ${b.cost ? `<span class="cmd-cost">${b.cost}</span>` : ''}
      </button>`;
    }).join('');

    poserIconesDeCout(node);
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
        <span class="bc-icon">${iconeSVG(def.icon, 26)}</span>
        <span class="bc-body">
          <span class="bc-name">${def.name}</span>
          <span class="bc-desc">${def.desc}</span>
        </span>
        <span class="bc-cost">${costLabel(def.cost)}</span>
      </button>`;
    }).join('');
    poserIconesDeCout(list);
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
    const vitesses = GAME_SPEEDS.map((sp) => `
      <button class="option compact ${sp.id === this.game.speedId ? 'active' : ''}" data-speed="${sp.id}">
        <span class="option-name">${sp.name}</span>
        <span class="option-desc">${sp.short}</span>
      </button>`).join('');
    const modal = this.showModal(`
      <h2>Partie en pause</h2>
      <p class="hint">La partie est sauvegardée : vous pouvez fermer l'onglet et la reprendre plus tard.</p>
      <h3 class="modal-sub">Vitesse de jeu</h3>
      <div class="options row">${vitesses}</div>
      <div class="modal-actions">
        <button class="btn primary" data-act="resume">Reprendre</button>
        <button class="btn" data-act="help">Comment jouer</button>
        <button class="btn" data-act="credits">Crédits</button>
        <button class="btn danger" data-act="resign">Abandonner</button>
      </div>`);
    modal.querySelectorAll('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.setSpeed(btn.dataset.speed);
        modal.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    modal.querySelector('[data-act="resume"]').addEventListener('click', () => this.game.togglePause());
    modal.querySelector('[data-act="help"]').addEventListener('click', () => this.showHelp());
    modal.querySelector('[data-act="credits"]').addEventListener('click', () => this.showCredits());
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
        <li><b>${ic('chantier')} Construire</b> : choisissez un bâtiment, puis touchez l'emplacement. Les villageois sélectionnés s'y mettent <b>tous</b> — à plusieurs, ça va bien plus vite. Enchaînez les poses : elles se mettent <b>en file</b> et l'ouvrier passe à la suivante en terminant</li>
        <li><b>Affecter quelqu'un à un chantier</b> : touchez un villageois, puis touchez le chantier — le même geste que pour l'envoyer au bois ou à la nourriture. La ligne <b>${ic('chantier')} Chantiers</b> de la barre <b>${ic('ouvriers')} Ouvriers</b> fait pareil avec ses <b>+ / −</b>, et un chantier sélectionné a son bouton <b>${ic('ouvriers')} +1 ouvrier</b>. (Double tap sur un chantier pour le sélectionner sans y envoyer personne.)</li>
        <li>Les villageois récoltent ${ic('food')} nourriture, ${ic('wood')} bois et ${ic('gold')} or ; il faut des <b>maisons</b> pour agrandir la population</li>
        <li><b>Attitudes</b> (unité sélectionnée) : ${ic('aggressive')} agressif poursuit loin, ${ic('defensive')} défensif revient à son poste, ${ic('standGround')} position tenue ne bouge pas, ${ic('passive')} sans attaque ignore l'ennemi</li>
        <li><b>Garnison</b> : touchez votre Centre-Ville ou une tour avec des unités sélectionnées pour les abriter — elles s'y soignent et chaque occupant ajoute une flèche. La <b>${ic('cloche')} cloche</b> y envoie tous les villageois d'un coup</li>
        <li><b>C'est vous qui affectez vos ouvriers</b> : quand un gisement s'épuise, le villageois rapporte son chargement puis attend vos ordres. La barre <b>${ic('ouvriers')} Ouvriers</b> montre qui fait quoi et permet de réaffecter d'un doigt</li>
        <li>Passez les <b>âges</b> depuis le Centre-Ville pour débloquer de nouvelles unités</li>
        <li><b>Vitesse de jeu</b> : réglable ici même (Tranquille à Blitz ×2) — et depuis l'écran d'accueil</li>
        <li><b>La partie se sauvegarde toute seule</b> toutes les 30 s et dès que vous quittez l'onglet : vous la retrouverez sur l'écran d'accueil, bouton <b>Reprendre</b></li>
        <li><b>Objectif</b> : détruire tous les bâtiments adverses et leurs villageois — en mode ${ic('modeExpress')} Express, leur dernier Centre-Ville suffit</li>
      </ul>
      <div class="modal-actions"><button class="btn primary" data-act="close">J'ai compris</button></div>`, { wide: true });
    modal.querySelector('[data-act="close"]').addEventListener('click', () => {
      if (this.game.paused) this.showPause(); else this.hideModal();
    });
  }

  /**
   * Crédits. La licence des icônes (CC BY 3.0) exige que leurs auteurs soient
   * cités et que la mention soit accessible depuis un menu : c'est ici.
   */
  showCredits() {
    const l = ICONES_LICENCE;
    const modal = this.showModal(`
      <h2>Crédits</h2>
      <ul class="help">
        <li><b>Icônes</b> — <a href="${l.url}" target="_blank" rel="noopener">${l.source}</a>,
          sous licence <a href="${l.licenceUrl}" target="_blank" rel="noopener">${l.licence}</a>.
          <small class="credits-auteurs">${l.auteurs.join(' · ')}</small></li>
        <li><b>Illustrations</b> (chevalier de l'accueil, portrait, écran de fin) — générées
          par l'auteur du jeu, découpées et détourées pour l'interface.</li>
        <li><b>Terrain, bâtiments, unités, sons</b> — dessinés et synthétisés au code,
          sans aucune image ni fichier audio.</li>
        <li><b>Jeu</b> — inspiré des principes d'Age of Empires, sans en reprendre
          aucun contenu : marques, ressources graphiques et sonores appartiennent
          à leurs propriétaires respectifs.</li>
      </ul>
      <div class="modal-actions"><button class="btn primary" data-act="close">Fermer</button></div>`,
      { wide: true });
    modal.querySelector('[data-act="close"]').addEventListener('click', () => {
      if (this.game.paused) this.showPause(); else this.hideModal();
    });
  }

  showGameOver(result) {
    const player = this.world.players[this.world.humanIndex];
    const enemy = this.world.players[1 - this.world.humanIndex];
    const egalite = result.winner === -1;
    const title = egalite ? 'Égalité' : (result.victory ? 'Victoire !' : 'Défaite');
    const summary = `
      <table class="scores">
        <tr><th></th><th>Vous</th><th>Adversaire</th></tr>
        <tr><td>Ressources récoltées</td>
            <td>${formatNumber(this.total(player))}</td><td>${formatNumber(this.total(enemy))}</td></tr>
        <tr><td>Unités formées</td><td>${player.stats.trained}</td><td>${enemy.stats.trained}</td></tr>
        <tr><td>Unités perdues</td><td>${player.stats.lost}</td><td>${enemy.stats.lost}</td></tr>
        <tr><td>Bâtiments construits</td><td>${player.stats.built}</td><td>${enemy.stats.built}</td></tr>
        <tr><td>Âge atteint</td><td>${AGES[player.age].name}</td><td>${AGES[enemy.age].name}</td></tr>
        ${result.scores ? `<tr class="total"><td><b>Score final</b></td>
          <td><b>${formatNumber(result.scores[player.index])}</b></td>
          <td><b>${formatNumber(result.scores[enemy.index])}</b></td></tr>` : ''}
      </table>`;
    const illustration = egalite ? ''
      : `<img class="fin-illustration${result.victory ? '' : ' tombe'}"
             src="assets/${result.victory ? 'heros' : 'defaite'}.webp" alt="" decoding="async">`;
    const modal = this.showModal(`
      ${illustration}
      <h2>${title}</h2>
      <p class="subtitle">${result.timeUp
        ? `Temps écoulé après ${formatTime(result.time)} — le score départage`
        : `Durée de la partie : ${formatTime(result.time)}`}</p>
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
