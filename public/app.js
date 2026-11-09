import { CATALOG } from './catalog.js';
import { ATTRIBUTES, GROUPS, newCharacter, availableSkills, addGrant, removeGrant, skillKey, budgets, setAllocation, setCreationMethod, resetSkillValues, issues, validateCharacter, loadCharacters, saveCharacters, STORAGE_KEY, normalizeCreationPriority } from './model.js';
import { createSkillPdf } from './pdf.js';
import * as PDFLib from './vendor/pdf-lib.esm.min.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const STAGES = ['Character', 'Skill grants', 'Creation', 'Advancement', 'Sheet & PDF'];
const ABBR = { Might: 'MIG', Agility: 'AGI', Reason: 'REA', Intuition: 'INT', Presence: 'PRE' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[v]));
const paths = {
  plus: 'M12 5v14M5 12h14', arrow: 'm9 5 7 7-7 7', download: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
  settings: 'M4 7h16M8 4v6M4 17h16m-4-3v6', book: 'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15',
  check: 'm5 12 4 4L19 6', copy: 'M9 9h12v12H9zM15 9V3H3v12h6', close: 'm6 6 12 12M6 18 18 6',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7', search: 'M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  file: 'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8M8 16h8', shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
let state = { characters: [], activeId: null }, storageError = '', recoveryRaw = null, search = '', group = '', toastTimer;
try { state = loadCharacters(localStorage); }
catch { storageError = 'Saved data could not be read. Download a recovery copy before starting a fresh ledger.'; try { recoveryRaw = localStorage.getItem(STORAGE_KEY); } catch { /* Storage is unavailable. */ } }
const current = () => state.characters.find(c => c.id === state.activeId);
function message(text, error = false) {
  toast.textContent = text; toast.className = error ? 'visible error' : 'visible'; toast.setAttribute('role', error ? 'alert' : 'status');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.className = ''; }, 5000);
}
function save() {
  if (recoveryRaw !== null) return;
  try { saveCharacters(localStorage, state); storageError = ''; }
  catch { storageError = 'This browser could not save your changes. Keep this tab open and download a character backup.'; }
}
function commit(focus) { save(); render(focus); }
function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const filename = c => c.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'character';
function openModal(content) { modal.innerHTML = content; if (!modal.open) modal.showModal(); }
const modalHead = title => `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>`;
function render(focus) {
  const c = current();
  const b = c ? budgets(c) : null;
  const available = c ? availableSkills(c) : [];
  app.innerHTML = `<aside class="sidebar" aria-label="Character library">
    <a class="brand" href="#" data-action="home"><img src="./mark.svg" width="37" height="37" alt=""><span>Steel <i>&</i> Story<small>CAMPAIGN SKILL LEDGER</small></span></a>
    <div class="library-label">YOUR CHARACTERS <span>${state.characters.length.toString().padStart(2, '0')}</span></div>
    <div class="character-list">${state.characters.length ? state.characters.map(ch => `<button class="character-item ${ch.id === state.activeId ? 'selected' : ''}" data-action="select-character" data-id="${esc(ch.id)}" ${ch.id === state.activeId ? 'aria-current="true"' : ''}><span class="avatar">${esc(ch.name.charAt(0).toUpperCase())}</span><span class="character-label">${esc(ch.name)}<small>${esc(ch.campaign || 'Campaign character')} · Level ${ch.level}</small></span><span class="character-dot"></span></button>`).join('') : '<p class="library-empty">A place for every character<br>in your story.</p>'}</div>
    <button class="new-character" data-action="new-character">${icon('plus')} New character</button>
    <div class="sidebar-bottom"><div class="local-note">${icon('shield')}<span>Saved on this device<small>Your characters stay in this browser.</small></span></div><button class="sidebar-link" data-action="import">${icon('file')} Import character backup</button><button class="sidebar-link" data-action="help">${icon('book')} How the ledger works</button><span class="sidebar-edition">DRAW STEEL · HOMEBREW EDITION</span></div>
  </aside><div class="workspace"><header class="topbar"><span class="breadcrumb">Campaign tools <span>/</span> <strong>Skill ledger</strong></span><span class="save-status ${storageError ? 'save-error' : ''}">${icon(storageError ? 'file' : 'check')} ${storageError ? 'Check local storage' : c ? 'Changes saved locally' : 'Browser-local characters'}</span></header>
  <main id="main" tabindex="-1">${storageError ? `<div class="warning" role="alert">${esc(storageError)} ${recoveryRaw !== null ? '<button data-action="recovery" class="text-button">Download recovery data</button> <button data-action="fresh-ledger" class="text-button">Start fresh</button>' : ''}</div>` : ''}${c ? `<section class="character-heading"><div><div class="eyebrow">YOUR CHARACTER, ON PAPER</div><h1>${esc(c.name)}</h1><p>${esc(c.campaign || 'A little preparation. More room for the adventure.')}</p></div><div class="heading-actions"><button class="icon-button bordered" data-action="duplicate" aria-label="Duplicate character" title="Duplicate character">${icon('copy')}</button><button class="icon-button bordered" data-action="settings" aria-label="Character campaign settings" title="Campaign settings">${icon('settings')}</button><button class="button primary" data-action="pdf">${icon('download')} Export PDF</button></div></section>
  <nav class="steps" aria-label="Character preparation">${STAGES.map((s, i) => `<button data-action="stage" data-stage="${i}" class="step ${c.stage === i ? 'active' : ''}" ${c.stage === i ? 'aria-current="step"' : ''}><span class="step-number">${i + 1}</span><span>${s}</span></button>`).join('')}</nav>
  <div class="character-overview"><span><strong>${available.length}</strong> available skills</span><span><strong>${c.grants.length}</strong> trained</span><span>Level <strong>${c.level}</strong></span><span class="overview-formula">20 base + attribute × 5 + training + points</span></div>
  <div id="allocation-warnings">${allocationWarnings(c)}</div>
  ${c.stage === 0 ? characterForm(c) : c.stage === 1 ? trainingView(c) : c.stage === 4 ? sheetView(c) : allocationView(c, b)}
  <footer class="editor-footer"><span>${c.stage === 2 ? 'You can save unspent creation points for later.' : c.stage === 3 ? 'Unspent advancement points carry over without a limit.' : 'Prepare here. Bring your printed sheet to the table.'}</span><div>${c.stage > 0 ? '<button class="button quiet" data-action="previous">Back</button>' : ''}${c.stage < 4 ? `<button class="button secondary" data-action="next">${['Choose skill grants', 'Allocate creation points', 'Manage advancement', 'Review your sheet'][c.stage]} ${icon('arrow')}</button>` : ''}</div></footer>` : welcome()}
  <footer class="page-footer"><span>STEEL & STORY</span><span>A skill companion for your Draw Steel campaign.</span>${c ? '<button class="text-button" data-action="backup">Download backup</button><button class="text-button danger-text" data-action="delete">Delete character</button>' : ''}</footer></main></div><input type="file" id="import-file" accept=".json,application/json" hidden>`;
  document.querySelector('#print-sheet').innerHTML = c ? paper(c) : '';
  if (focus) [...document.querySelectorAll('[data-focus]')].find(el => el.dataset.focus === focus)?.focus();
}
function allocationWarnings(c) {
  return issues(c).length ? `<div class="warning" role="alert"><strong>Review your allocations</strong><ul>${issues(c).map(v => `<li>${esc(v)}</li>`).join('')}</ul><p>Existing points are kept. Reduce spending or adjust the character's level, XP, or settings.</p></div>` : '';
}
// Keep input elements mounted while editing. Replacing a field on blur can swallow
// the next button click, and replacing it on input loses the caret and selection.
function syncLiveValues(c) {
  const heading = document.querySelector('.character-heading h1');
  if (heading) heading.textContent = c.name;
  const subtitle = document.querySelector('.character-heading p');
  if (subtitle) subtitle.textContent = c.campaign || 'A little preparation. More room for the adventure.';
  const selected = document.querySelector('.character-item.selected');
  if (selected) {
    selected.querySelector('.avatar').textContent = c.name.charAt(0).toUpperCase();
    selected.querySelector('.character-label').childNodes[0].textContent = c.name;
    selected.querySelector('.character-label small').textContent = `${c.campaign || 'Campaign character'} · Level ${c.level}`;
  }
  const overview = document.querySelector('.character-overview');
  if (overview) overview.children[2].innerHTML = `Level <strong>${c.level}</strong>`;
  const warnings = document.querySelector('#allocation-warnings');
  if (warnings) warnings.innerHTML = allocationWarnings(c);
  if (c.stage === 2 || c.stage === 3) {
    const parsed = document.createElement('div'); parsed.innerHTML = allocationView(c, budgets(c));
    const cards = document.querySelector('.budget-grid');
    if (cards) cards.replaceWith(parsed.querySelector('.budget-grid'));
    const phase = c.stage === 2 ? 'creation' : 'advancement', b = budgets(c);
    const skills = new Map(availableSkills(c).map(s => [s.key, s]));
    for (const field of document.querySelectorAll('[data-allocation]')) {
      const s = skills.get(field.dataset.allocation), row = field.closest('tr');
      const value = s[phase], limit = phase === 'creation' ? 15 : b.advancementLimit;
      const remaining = phase === 'creation' ? b.creationRemaining : b.advancementRemaining;
      if (field !== document.activeElement) field.value = value;
      row.querySelector('[data-delta="-1"]').disabled = value <= 0;
      row.querySelector('[data-delta="1"]').disabled = remaining <= 0 || value >= limit;
      row.querySelector('.skill-total').innerHTML = `${s.total}<small>%</small>`;
      row.querySelector('.skill-detail small:last-child').textContent = `20 + (${s.attributeValue} × 5) + ${s.training} training + ${s.creation} creation + ${s.advancement} advancement = ${s.total}%`;
    }
  }
  document.querySelector('#print-sheet').innerHTML = paper(c);
  const status = document.querySelector('.save-status');
  if (status) { status.classList.toggle('save-error', !!storageError); status.innerHTML = `${icon(storageError ? 'file' : 'check')} ${storageError ? 'Check local storage' : 'Changes saved locally'}`; }
}
function applyField(input, reportError = false) {
  const c = current(); if (!c) return;
  try {
    if (input.dataset.field) {
      const key = input.dataset.field;
      if (['name', 'campaign'].includes(key)) {
        const value = input.value.trim();
        if (key === 'name' && !value) throw new Error('Give your character a name.');
        c[key] = value.slice(0, 80);
      } else {
        const value = input.value === '' ? NaN : Number(input.value), min = key === 'level' ? 1 : 0, max = key === 'level' ? 10000 : 1000000;
        if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Enter a whole ${key} value from ${min} to ${max}.`);
        c[key] = value;
      }
    } else if (input.dataset.attribute) {
      const value = input.value === '' ? NaN : Number(input.value);
      if (!Number.isSafeInteger(value) || value < -100 || value > 100) throw new Error('Enter a whole attribute value from -100 to 100.');
      c.attributes[input.dataset.attribute] = value;
    } else if (input.dataset.allocation) {
      const phase = c.stage === 2 ? 'creation' : 'advancement';
      setAllocation(c, phase, input.dataset.allocation, input.value === '' ? NaN : Number(input.value));
    } else return;
    input.setCustomValidity(''); save(); syncLiveValues(c);
  } catch (error) {
    input.setCustomValidity(error.message);
    if (reportError) {
      if (input.dataset.field) input.value = c[input.dataset.field];
      if (input.dataset.attribute) input.value = c.attributes[input.dataset.attribute];
      if (input.dataset.allocation) input.value = c[c.stage === 2 ? 'creation' : 'advancement'][input.dataset.allocation] || 0;
      input.setCustomValidity(''); message(error.message, true);
    }
  }
}
function welcome() {
  return `<section class="welcome"><div class="eyebrow">THE ADVENTURE STARTS WITH A CHARACTER</div><h1>More character.<br><em>Less paperwork.</em></h1><p>Bring your skills together, make room to grow, and take a clean character sheet to the table.</p><button class="button primary large" data-action="new-character">${icon('plus')} Create your first character</button><div class="welcome-note">No account needed. Saved in your browser.</div><div class="welcome-features"><article>${icon('book')}<h3>Make it yours</h3><p>Your attributes, your skill grants,<br>your character's specialties.</p></article><article>${icon('plus')}<h3>Room to grow</h3><p>Keep creation points and<br>XP improvements separate.</p></article><article>${icon('file')}<h3>Ready for the table</h3><p>A clear, categorized PDF.<br>Print it and start playing.</p></article></div><span class="welcome-watermark" aria-hidden="true">S<span>&</span>S</span></section>`;
}
function characterForm(c) {
  return `<section class="panel"><div class="panel-heading"><div><span class="section-index">01 / THE FOUNDATION</span><h2>Who’s joining the story?</h2><p>Enter the attributes from your Draw Steel character.</p></div><span class="tag">Manual entry</span></div><div class="identity-fields"><label>Character name<input data-field="name" data-focus="name" maxlength="80" value="${esc(c.name)}" placeholder="Character name" required></label><label><span>Campaign <span class="optional">optional</span></span><input data-field="campaign" data-focus="campaign" maxlength="80" value="${esc(c.campaign)}" placeholder="Give this adventure a name"></label></div><div class="section-label">CHARACTER ATTRIBUTES</div><div class="attributes">${ATTRIBUTES.map(a => `<label class="attribute"><span>${a}</span><input type="number" min="-100" max="100" step="1" data-attribute="${a}" data-focus="attribute-${a}" value="${c.attributes[a]}" aria-label="${a} attribute"><small>${ABBR[a]}</small></label>`).join('')}</div><div class="formula-note">${icon('book')}<p>Every skill starts at <strong>20% + its linked attribute × 5</strong>. Training adds <strong>15 percentage points</strong>. Changing an attribute updates linked skills automatically.</p></div></section><section class="small-note"><span class="note-dot"></span><p>Already have a Draw Steel character? Bring over their attributes and skill grants. Culture and career choices are managed outside this ledger.</p></section>`;
}
function trainingView(c) {
  const trained = availableSkills(c).filter(s => s.trained);
  return `<section class="panel"><div class="panel-heading"><div><span class="section-index">02 / WHAT YOU KNOW</span><h2>Choose your skill grants</h2><p>Each grant trains one skill. Your Draw Steel character determines which grants you have.</p></div><button class="button primary" data-action="add-grant">${icon('plus')} Add skill grant</button></div><div class="training-note"><span class="status-dot"></span><p><strong>All 14 standard skills are already available.</strong> A grant adds training to a standard skill or unlocks a professional skill.</p></div>${trained.length ? `<div class="granted-list">${trained.map(s => `<article class="granted-skill"><span class="grant-symbol">${icon('check')}</span><div><h3>${esc(s.name)}</h3><p>${esc(s.group)} <span>·</span> ${esc(s.attribute)} <span>·</span> ${esc(s.type)}</p><p class="skill-description">${esc(s.description)}</p></div><span class="training-bonus">+15%</span><button class="icon-button" data-action="remove-grant" data-key="${esc(s.key)}" aria-label="Remove training from ${esc(s.name)}">${icon('close')}</button></article>`).join('')}</div>` : `<div class="empty-state">${icon('book')}<h3>A little training goes a long way.</h3><p>Add the skills granted by your character’s culture, career, or other choices.</p><button class="button secondary" data-action="add-grant">Choose a skill</button></div>`}</section>`;
}
function budgetCard(label, remaining, spent, total, note, className = '') {
  const percentage = total ? Math.min(100, spent / total * 100) : spent ? 100 : 0;
  return `<article class="budget-card ${className}"><div><span class="section-label">${label}</span><span class="budget-fraction">${spent} / ${total} spent</span></div><p><strong class="${remaining < 0 ? 'danger-text' : ''}">${remaining}</strong> <span>points remaining</span></p><div class="budget-track"><span style="width:${percentage}%"></span></div><small>${note}</small></article>`;
}
function creationMethodButtons(c) {
  return `<div class="segmented-choice compact" role="group" aria-label="Creation method"><button type="button" data-action="toggle-creation-method" data-method="points" class="${c.creationMethod === 'points' ? 'selected' : ''}" aria-pressed="${c.creationMethod === 'points'}">Point buy</button><button type="button" data-action="toggle-creation-method" data-method="priority" class="${c.creationMethod === 'priority' ? 'selected' : ''}" aria-pressed="${c.creationMethod === 'priority'}">Priority ladder</button></div>`;
}
function creationControls(c) {
  return `<div class="creation-controls">${creationMethodButtons(c)}<button type="button" class="button secondary reset-skill-values" data-action="reset-skill-values">${icon('trash')} Reset skill values</button></div>`;
}
function movePrioritySkill(c, key, delta) {
  const order = normalizeCreationPriority(c, availableSkills(c));
  const index = order.indexOf(key);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
  const updated = [...order];
  [updated[index], updated[nextIndex]] = [updated[nextIndex], updated[index]];
  c.creationPriority = updated;
}
function renderPriorityCreation(c) {
  const order = normalizeCreationPriority(c, availableSkills(c));
  return `<div class="priority-panel"><div class="panel-heading"><div><h2>Rank your strongest skills</h2></div></div><div class="priority-list">${order.map((key, index) => {
    const skill = availableSkills(c).find(s => s.key === key);
    if (!skill) return '';
    const value = skill.creation;
    return `<div class="priority-row" draggable="true" data-priority-key="${esc(skill.key)}"><span class="priority-rank">${index + 1}</span><span class="priority-grip" aria-hidden="true">${icon('grip')}</span><div class="priority-name"><strong>${esc(skill.name)}</strong></div><span class="priority-value">${value}</span><div class="priority-buttons"><button type="button" data-action="move-priority" data-key="${esc(skill.key)}" data-delta="-1" aria-label="Move ${esc(skill.name)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="move-priority" data-key="${esc(skill.key)}" data-delta="1" aria-label="Move ${esc(skill.name)} down" ${index === order.length - 1 ? 'disabled' : ''}>↓</button></div></div>`;
  }).join('')}</div></div>`;
}
function allocationView(c, b) {
  const creation = c.stage === 2;
  const creationModeText = c.creationMethod === 'priority'
    ? `${creationControls(c)}<div class="budget-grid">${budgetCard('CREATION POINTS', b.creationRemaining, b.creationSpent, 150, 'Your priority ladder distributes the full creation budget.')}<article class="allowance-card"><span class="section-label">CREATION METHOD</span><p><strong>Priority</strong> <span>ladder</span></p><small>Existing point-buy scores set the initial order. Each skill is capped at 15.</small></article></div>${renderPriorityCreation(c)}`
    : `${creationControls(c)}<div class="budget-grid">${budgetCard('CREATION POINTS', b.creationRemaining, b.creationSpent, 150, 'Your starting budget. Unspent points stay available.')}<article class="allowance-card"><span class="section-label">CREATION METHOD</span><p><strong>Point</strong> <span>buy</span></p><small>Assign up to 15 points per skill. Unspent points remain available.</small></article></div>`;
  return `${creation ? creationModeText : `<section class="advancement-inputs"><div><span class="section-index">04 / ROOM TO GROW</span><h2>Keep the story moving.</h2><p>XP is your running total since character creation.</p></div><label>Current level<input type="number" min="1" max="10000" step="1" value="${c.level}" data-field="level" data-focus="level"></label><label>Total XP earned<input type="number" min="0" max="1000000" step="1" value="${c.xp}" data-field="xp" data-focus="xp"></label></section><div class="budget-grid">${budgetCard('ADVANCEMENT POINTS', b.advancementRemaining, b.advancementSpent, b.advancementBudget, `${c.xp} total XP × ${c.rules.pointsPerXp} points per XP`)}<article class="allowance-card"><span class="section-label">ADVANCEMENT PER SKILL</span><p><strong>${b.advancementLimit}</strong> <span>points maximum</span></p><small>Level ${c.level} × ${c.rules.perSkillPerLevel} allowance. Creation points are separate.</small><button class="text-button" data-action="settings">Adjust campaign settings ${icon('settings')}</button></article></div>`}<section class="panel skill-panel"><div class="panel-heading"><div><h2>${creation ? 'Build your starting skills' : 'Invest in your skills'}</h2><p>${creation ? (c.creationMethod === 'priority' ? 'Rank the available skills from strongest to weakest.' : 'Distribute up to 150 points across your available skills.') : 'Spend earned points on any available skill, within its advancement allowance.'}</p></div><label class="search-field">${icon('search')}<input type="search" id="skill-search" value="${esc(search)}" placeholder="Find a skill…" aria-label="Search available skills"></label></div><div class="filter-tabs" role="group" aria-label="Filter by skill category">${['', ...GROUPS].map(g => `<button data-action="filter-group" data-group="${g}" class="${group === g ? 'active' : ''}" aria-pressed="${group === g}">${g || 'All skills'}</button>`).join('')}</div><div class="skills-content">${skillTables(c)}</div><div class="table-legend"><span><i class="trained-marker"></i> Trained +15%</span><span>Expand a skill name for its description and calculation.</span></div></section>`;
}
function skillTables(c) {
  if (c.stage === 2 && c.creationMethod === 'priority') {
    const order = normalizeCreationPriority(c, availableSkills(c));
    const skills = availableSkills(c).filter(s => (!group || s.group === group) && order.includes(s.key) && `${s.name} ${s.aliases.join(' ')} ${s.description}`.toLowerCase().includes(search.toLowerCase()));
    if (!skills.length) return '<div class="empty-state compact"><h3>No matching skills</h3><p>Try another category or search term. Professional skills need a grant first.</p></div>';
    return GROUPS.filter(g => skills.some(s => s.group === g)).map(g => `<div class="skill-group"><div class="group-heading"><h3>${g}</h3><span>${skills.filter(s => s.group === g).length} SKILLS</span></div><div class="priority-skill-list">${skills.filter(s => s.group === g).map(s => {
      const index = order.indexOf(s.key);
      const value = s.creation;
      return `<div class="priority-row"><span class="priority-rank">${index + 1}</span><div class="priority-name"><strong>${esc(s.name)}</strong><small>${esc(s.group)} · ${esc(s.attribute)}</small></div><span class="priority-value">${value}</span></div>`;
    }).join('')}</div></div>`).join('');
  }
  const phase = c.stage === 2 ? 'creation' : 'advancement', b = budgets(c);
  const skills = availableSkills(c).filter(s => (!group || s.group === group) && `${s.name} ${s.aliases.join(' ')} ${s.description}`.toLowerCase().includes(search.toLowerCase()));
  if (!skills.length) return '<div class="empty-state compact"><h3>No matching skills</h3><p>Try another category or search term. Professional skills need a grant first.</p></div>';
  return GROUPS.filter(g => skills.some(s => s.group === g)).map(g => `<div class="skill-group"><div class="group-heading"><h3>${g}</h3><span>${skills.filter(s => s.group === g).length} SKILLS</span></div><div class="table-scroll"><table class="skill-table"><thead><tr><th scope="col">Skill</th><th scope="col">Attribute</th><th scope="col">Creation</th><th scope="col">Advancement</th><th scope="col">Total</th></tr></thead><tbody>${skills.filter(s => s.group === g).map(s => {
    const value = s[phase], limit = phase === 'creation' ? 15 : b.advancementLimit;
    const remaining = phase === 'creation' ? b.creationRemaining : b.advancementRemaining;
    const input = `<div class="point-stepper"><button data-action="allocate" data-key="${esc(s.key)}" data-delta="-1" ${value <= 0 ? 'disabled' : ''} aria-label="Remove one ${phase} point from ${esc(s.name)}">−</button><input type="number" min="0" step="1" value="${value}" data-allocation="${esc(s.key)}" data-focus="${phase}-${esc(s.key)}" aria-label="${esc(s.name)} ${phase} points"><button data-action="allocate" data-key="${esc(s.key)}" data-delta="1" ${remaining <= 0 || value >= limit ? 'disabled' : ''} aria-label="Add one ${phase} point to ${esc(s.name)}">+</button></div>`;
    return `<tr><th scope="row"><details class="skill-detail"><summary>${s.trained ? '<i class="trained-marker" title="Trained"></i>' : '<i class="untrained-marker"></i>'}<span>${esc(s.name)}</span></summary><p>${esc(s.description)}</p>${s.aliases.length ? `<small>Also covers: ${esc(s.aliases.join(', '))}</small>` : ''}<small>20 + (${s.attributeValue} × 5) + ${s.training} training + ${s.creation} creation + ${s.advancement} advancement = ${s.total}%</small></details></th><td><span class="attribute-pill">${esc(s.attribute)} <small>${s.attributeValue >= 0 ? '+' : ''}${s.attributeValue}</small></span></td><td>${phase === 'creation' ? input : `<span class="fixed-points">${s.creation}</span>`}</td><td>${phase === 'advancement' ? input : `<span class="fixed-points">${s.advancement}</span>`}</td><td class="skill-total">${s.total}<small>%</small></td></tr>`;
  }).join('')}</tbody></table></div></div>`).join('');
}
function paper(c) {
  const skills = availableSkills(c), b = budgets(c);
  return `<div class="paper"><div class="paper-title"><div><span>STEEL & STORY / SKILL SHEET</span><h2>${esc(c.name)}</h2><p>${esc(c.campaign || 'Draw Steel campaign')} · Level ${c.level} · ${c.xp} total XP</p></div><img src="./mark.svg" width="44" height="44" alt=""></div><div class="paper-attributes">${ATTRIBUTES.map(a => `<div><span>${a}</span><strong>${c.attributes[a] >= 0 ? '+' : ''}${c.attributes[a]}</strong></div>`).join('')}</div><div class="paper-groups">${GROUPS.filter(g => skills.some(s => s.group === g)).map(g => `<section class="paper-group"><h3>${g}</h3><table><thead><tr><th>Skill</th><th>Attr.</th><th>Create</th><th>Adv.</th><th>Total</th></tr></thead><tbody>${skills.filter(s => s.group === g).map(s => `<tr><th scope="row">${esc(s.name)}${s.trained ? '<sup>•</sup>' : ''}</th><td>${ABBR[s.attribute]}</td><td>${s.creation}</td><td>${s.advancement}</td><td><strong>${s.total}%</strong></td></tr>`).join('')}</tbody></table></section>`).join('')}</div><div class="paper-bottom"><p>• Trained (+15%). Total = 20 + attribute × 5 + training + creation + advancement.</p><p>Creation: ${b.creationSpent}/150 spent · ${b.creationRemaining} remaining. Advancement: ${b.advancementSpent}/${b.advancementBudget} spent · ${b.advancementRemaining} remaining.</p><p>${c.rules.pointsPerXp} points per XP · ${c.rules.perSkillPerLevel} advancement points per level per skill.</p></div></div>`;
}
function sheetView(c) { return `<section class="sheet-toolbar"><div><span class="section-index">05 / READY FOR THE TABLE</span><h2>Your character, at a glance.</h2><p>A4 format. Alphabetical skills, grouped by category.</p></div><button class="button secondary" data-action="print">${icon('file')} Print sheet</button></section><div class="paper-preview">${paper(c)}</div>`; }
function grantPicker() {
  openModal(`${modalHead('Add a skill grant')}<p class="modal-intro">Choose a skill your character has been granted. One grant trains one skill.</p><div class="grant-filters"><label class="search-field">${icon('search')}<input id="grant-search" type="search" placeholder="Find a skill or alternative name…" aria-label="Search skill catalog"></label><label class="sr-only" for="grant-group">Skill category</label><select id="grant-group"><option value="">All categories</option>${GROUPS.map(g => `<option>${g}</option>`).join('')}</select></div><div id="grant-results" class="grant-results"></div>`);
  renderGrantResults();
}
function renderGrantResults() {
  const c = current(), q = (document.querySelector('#grant-search')?.value || '').toLowerCase(), g = document.querySelector('#grant-group')?.value || '';
  const matches = CATALOG.filter(s => (!g || s.group === g) && `${s.name} ${s.aliases.join(' ')} ${s.suggestions.join(' ')}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  document.querySelector('#grant-results').innerHTML = matches.length ? matches.map(s => {
    const selected = !s.template && c.grants.some(v => v.catalogId === s.id);
    return `<button class="grant-option" data-action="choose-grant" data-catalog="${s.id}" ${selected ? 'disabled' : ''}><span><strong>${esc(s.name)}${s.template ? ' (specialty)' : ''}</strong><small>${esc(s.group)} · ${esc(s.attribute)} · ${s.type}</small><span>${esc(s.description)}</span></span><span class="grant-option-action">${selected ? icon('check') : icon('plus')}</span></button>`;
  }).join('') : '<p class="empty-state">No matching skills.</p>';
}
function specialtyPicker(catalogId) {
  const s = CATALOG.find(v => v.id === catalogId);
  openModal(`${modalHead(`Choose a ${s.name} specialty`)}<p class="modal-intro">Each specialty is a separate trained skill with its own points.</p><form id="specialty-form" data-catalog="${s.id}"><label>Suggested specialty<select id="specialty-choice" required><option value="">Choose a specialty…</option>${s.suggestions.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}<option value="__custom">Other / custom name</option></select></label><label id="custom-specialty-label" hidden>Custom specialty<input id="custom-specialty" maxlength="80" placeholder="For example: ${s.name === 'Culture' ? 'Dwarven' : s.name === 'Craft' ? 'Glassblowing' : 'Astronomy'}"></label><div class="modal-actions"><button type="button" class="button quiet" data-action="add-grant">Back to skills</button><button class="button primary" type="submit">Add specialty ${icon('plus')}</button></div></form>`);
  if (!s.suggestions.length) { document.querySelector('#specialty-choice').value = '__custom'; document.querySelector('#custom-specialty-label').hidden = false; document.querySelector('#custom-specialty').required = true; }
}
function settings() {
  const c = current();
  openModal(`${modalHead('Campaign settings')}<p class="modal-intro">These rules belong to <strong>${esc(c.name)}</strong>. Other characters keep their own settings.</p><form id="settings-form"><label>Skill points per XP<input id="points-per-xp" type="number" min="0" max="10000" step="1" required value="${c.rules.pointsPerXp}"><small>Total XP × this number is the advancement budget.</small></label><label>Advancement allowance per level, per skill<input id="per-skill-per-level" type="number" min="0" max="10000" step="1" required value="${c.rules.perSkillPerLevel}"><small>Current level × this number is each skill’s advancement limit.</small></label><p class="settings-note">Creation stays at 150 points, with up to 15 per skill. Existing allocations are kept if you lower a rule; any excess will be highlighted.</p><div class="modal-actions"><button type="button" class="button quiet" data-action="close-modal">Cancel</button><button type="submit" class="button primary">Save settings</button></div></form>`);
}
function confirmation(title, text, action, label, key = '') { openModal(`${modalHead(title)}<p class="modal-intro">${esc(text)}</p><div class="modal-actions"><button class="button quiet" data-action="close-modal">Cancel</button><button class="button danger" data-action="${action}" data-key="${esc(key)}">${esc(label)}</button></div>`); }
function go(stage) { const c = current(); if (!c) return; c.stage = Math.max(0, Math.min(4, stage)); search = ''; group = ''; commit(); document.querySelector('#main').focus(); }
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  event.preventDefault();
  const c = current(), action = button.dataset.action;
  try {
    if (action === 'new-character') { if (recoveryRaw !== null) { message('Download your recovery data and start a fresh ledger first.', true); return; } const created = newCharacter(); state.characters.push(created); state.activeId = created.id; search = ''; group = ''; commit('name'); document.querySelector('[data-field="name"]').select(); }
    if (action === 'select-character') { state.activeId = button.dataset.id; search = ''; group = ''; commit(); }
    if (action === 'home') { state.activeId = null; render(); }
    if (action === 'stage') go(Number(button.dataset.stage));
    if (action === 'next') go(c.stage + 1);
    if (action === 'previous') go(c.stage - 1);
    if (action === 'settings') settings();
    if (action === 'add-grant') grantPicker();
    if (action === 'close-modal') modal.close();
    if (action === 'choose-grant') { const s = CATALOG.find(v => v.id === button.dataset.catalog); if (s.template) specialtyPicker(s.id); else { addGrant(c, s.id); modal.close(); commit(); message(`${s.name} is now trained.`); } }
    if (action === 'remove-grant') {
      const s = availableSkills(c).find(v => v.key === button.dataset.key);
      if (s.type === 'Professional' && (s.creation || s.advancement)) confirmation('Remove skill grant?', `Removing ${s.name} also returns its ${s.creation} creation and ${s.advancement} advancement points to their separate pools.`, 'confirm-remove-grant', 'Remove grant', s.key);
      else { removeGrant(c, s.key); commit(); }
    }
    if (action === 'confirm-remove-grant') { removeGrant(c, button.dataset.key); modal.close(); commit(); }
    if (action === 'toggle-creation-method') {
      setCreationMethod(c, button.dataset.method);
      commit();
    }
    if (action === 'reset-skill-values') confirmation('Reset all skill values?', 'This clears creation and advancement points. In priority mode, creation points will be recalculated from the default skill order.', 'confirm-reset-skill-values', 'Reset values');
    if (action === 'confirm-reset-skill-values') { resetSkillValues(c); modal.close(); commit(); message('Skill values reset.'); }
    if (action === 'move-priority') { movePrioritySkill(c, button.dataset.key, Number(button.dataset.delta)); c.creationPriority = normalizeCreationPriority(c, availableSkills(c)); commit(); }
    if (action === 'allocate') { const phase = c.stage === 2 ? 'creation' : 'advancement'; setAllocation(c, phase, button.dataset.key, (c[phase][button.dataset.key] || 0) + Number(button.dataset.delta)); commit(`${phase}-${button.dataset.key}`); }
    if (action === 'filter-group') { group = button.dataset.group; render(); }
    if (action === 'duplicate') { const copy = structuredClone(c); copy.id = crypto.randomUUID(); copy.name = `${c.name.slice(0, 73)} (copy)`; state.characters.push(copy); state.activeId = copy.id; commit(); message('Character duplicated.'); }
    if (action === 'backup') download(JSON.stringify({ version: 1, character: c }, null, 2), `${filename(c)}-character.json`, 'application/json');
    if (action === 'import') document.querySelector('#import-file').click();
    if (action === 'delete') confirmation('Delete this character?', `Download a backup if you want to keep ${c.name}. Deleting this character removes it from this browser.`, 'confirm-delete', 'Delete character');
    if (action === 'confirm-delete') { state.characters = state.characters.filter(v => v.id !== c.id); state.activeId = state.characters[0]?.id || null; modal.close(); commit(); }
    if (action === 'recovery') download(recoveryRaw, 'skill-ledger-recovery.json', 'application/json');
    if (action === 'fresh-ledger') confirmation('Start a fresh ledger?', 'Download the recovery copy first if you want to keep the unreadable saved data. Starting fresh replaces it.', 'confirm-fresh', 'Start fresh');
    if (action === 'confirm-fresh') { recoveryRaw = null; state = { characters: [], activeId: null }; modal.close(); commit(); }
    if (action === 'print') { if (issues(c).length) { message('Resolve allocation warnings before exporting the sheet.', true); return; } window.print(); }
    if (action === 'pdf') {
      if (issues(c).length) { message('Resolve allocation warnings before exporting the sheet.', true); return; }
      button.disabled = true; button.innerHTML = 'Preparing PDF…';
      const exportCharacter = structuredClone(c);
      try { const bytes = await createSkillPdf(exportCharacter, PDFLib); download(bytes, `${filename(exportCharacter)}-skills.pdf`, 'application/pdf'); message('Your skill sheet is ready.'); }
      catch { openModal(`${modalHead('Use the print version')}<p class="modal-intro">The downloadable PDF could not be created. Use the print version to preserve your character’s text, including names that need additional fonts. Choose “Save as PDF” in the print window.</p><div class="modal-actions"><button class="button primary" data-action="print">Print / Save as PDF</button></div>`); }
      finally { button.disabled = false; button.innerHTML = `${icon('download')} Export PDF`; }
    }
    if (action === 'help') openModal(`${modalHead('How the ledger works')}<div class="help-content"><p>Prepare a printable skill sheet for your campaign’s D100 roll-under skill rules. Combat stays unchanged.</p><h3>Your skill percentage</h3><p>20 + linked attribute × 5 + 15 if trained + creation points + advancement points.</p><h3>Grants and specialties</h3><p>Standard skills are available to everyone. A skill grant provides training, and unlocks a professional skill. Each Craft, Culture, or Lore specialty needs its own grant.</p><h3>Two point pools</h3><p>Creation provides 150 points, up to 15 per skill. Advancement uses cumulative XP × your points-per-XP setting. Each skill can receive up to your level × its advancement allowance, in addition to creation points. Unspent points carry over. Skill percentages have no overall cap.</p><h3>Keep a copy</h3><p>Characters are saved in this browser. Download a character backup to move one to another device or restore it later. Export a PDF for play.</p></div>`);
  } catch (error) { message(error.message || 'That change could not be applied.', true); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'skill-search') { search = event.target.value; document.querySelector('.skills-content').innerHTML = skillTables(current()); }
  if (event.target.id === 'grant-search') renderGrantResults();
  if (event.target.dataset.field || event.target.dataset.attribute || event.target.dataset.allocation) applyField(event.target);
});
document.addEventListener('change', async event => {
  const input = event.target, c = current();
  try {
    if (input.id === 'grant-group') renderGrantResults();
    if (input.id === 'specialty-choice') { const custom = input.value === '__custom'; document.querySelector('#custom-specialty-label').hidden = !custom; document.querySelector('#custom-specialty').required = custom; if (custom) document.querySelector('#custom-specialty').focus(); }
    if (input.id === 'import-file' && input.files[0]) {
      if (recoveryRaw !== null) throw new Error('Save your recovery data and start a fresh ledger before importing.');
      if (input.files[0].size > 2000000) throw new Error('This file is too large for a character backup.');
      const data = JSON.parse(await input.files[0].text());
      if (!data || typeof data !== 'object' || data.version !== 1) throw new Error('This backup version is not supported.');
      const imported = validateCharacter(data.character); imported.id = crypto.randomUUID(); state.characters.push(imported); state.activeId = imported.id; commit(); message('Character imported as a separate copy.');
    }
    if (!c) return;
    if (input.dataset.field || input.dataset.attribute || input.dataset.allocation) applyField(input, true);
  } catch (error) { message(error instanceof SyntaxError ? 'This file is not a valid character backup.' : error.message, true); }
});
document.addEventListener('submit', event => {
  if (!['settings-form', 'specialty-form'].includes(event.target.id)) return;
  event.preventDefault(); const c = current();
  try {
    if (event.target.id === 'settings-form') {
      const pointsPerXp = Number(document.querySelector('#points-per-xp').value), perSkillPerLevel = Number(document.querySelector('#per-skill-per-level').value);
      if (![pointsPerXp, perSkillPerLevel].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 10000)) throw new Error('Settings must be whole numbers from zero to 10,000.');
      c.rules = { pointsPerXp, perSkillPerLevel }; modal.close(); commit(); message('Campaign settings saved for this character.');
    } else {
      const choice = document.querySelector('#specialty-choice').value;
      if (!choice) throw new Error('Choose a specialty.');
      addGrant(c, event.target.dataset.catalog, choice === '__custom' ? document.querySelector('#custom-specialty').value : choice);
      modal.close(); commit(); message('Specialty added as a separate trained skill.');
    }
  } catch (error) { message(error.message, true); }
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  try { state = loadCharacters(localStorage); recoveryRaw = null; storageError = ''; render(); message('Character library updated from another tab.'); }
  catch { message('Another tab saved data this ledger could not read. Download a backup of your current character.', true); }
});
document.addEventListener('dragstart', event => {
  const row = event.target.closest('.priority-row[data-priority-key]');
  if (!row) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', row.dataset.priorityKey);
  row.classList.add('dragging');
});
document.addEventListener('dragover', event => {
  const row = event.target.closest('.priority-row[data-priority-key]');
  if (!row) return;
  event.preventDefault();
  document.querySelectorAll('.priority-row.drop-before, .priority-row.drop-after').forEach(item => item.classList.remove('drop-before', 'drop-after'));
  row.classList.toggle('drop-before', event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2);
  row.classList.toggle('drop-after', !row.classList.contains('drop-before'));
});
document.addEventListener('drop', event => {
  const target = event.target.closest('.priority-row[data-priority-key]');
  if (!target) return;
  event.preventDefault();
  const sourceKey = event.dataTransfer.getData('text/plain');
  if (!sourceKey || sourceKey === target.dataset.priorityKey) return;
  const c = current(), order = normalizeCreationPriority(c, availableSkills(c));
  const sourceIndex = order.indexOf(sourceKey);
  if (sourceIndex < 0) return;
  const [moved] = order.splice(sourceIndex, 1);
  const targetIndex = order.indexOf(target.dataset.priorityKey);
  const insertAt = targetIndex + (event.clientY >= target.getBoundingClientRect().top + target.offsetHeight / 2 ? 1 : 0);
  order.splice(insertAt, 0, moved);
  c.creationPriority = order;
  commit();
});
document.addEventListener('dragend', () => {
  document.querySelectorAll('.priority-row.dragging, .priority-row.drop-before, .priority-row.drop-after').forEach(row => row.classList.remove('dragging', 'drop-before', 'drop-after'));
});
render();
