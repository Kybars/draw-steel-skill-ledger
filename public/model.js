import { CATALOG } from './catalog.js';

export const ATTRIBUTES = ['Might', 'Agility', 'Reason', 'Intuition', 'Presence'];
export const GROUPS = ['Crafting', 'Exploration', 'Interpersonal', 'Intrigue', 'Lore'];
export const DEFAULT_RULES = Object.freeze({ pointsPerXp: 2, perSkillPerLevel: 5 });
export const CREATION_BUDGET = 150;
export const CREATION_LIMIT = 15;
const byId = new Map(CATALOG.map(s => [s.id, s]));
const integer = (v, min = 0, max = 1000000) => Number.isSafeInteger(v) && v >= min && v <= max;
export const normalizeName = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ');

export function skillKey(catalogId, specialty = '') {
  return specialty ? `${catalogId}:${normalizeName(specialty).toLocaleLowerCase('en')}` : catalogId;
}
export function newCharacter(name = 'New character') {
  return { id: crypto.randomUUID(), name, campaign: '', attributes: Object.fromEntries(ATTRIBUTES.map(a => [a, 0])), level: 1, xp: 0, rules: { ...DEFAULT_RULES }, grants: [], creation: {}, advancement: {}, creationMethod: 'points', creationPriority: [], stage: 0 };
}
export function normalizeCreationPriority(c, skills = availableSkills(c)) {
  const available = Array.isArray(skills) ? skills.map(s => s.key) : [];
  const seen = new Set();
  const ordered = (Array.isArray(c.creationPriority) ? c.creationPriority : []).filter(key => {
    if (!available.includes(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const key of available) {
    if (!seen.has(key)) ordered.push(key);
  }
  return ordered;
}
export function rankCreationPriority(c, skills = availableSkills(c)) {
  const existingOrder = normalizeCreationPriority(c, skills);
  const rank = new Map(existingOrder.map((key, index) => [key, index]));
  return [...skills]
    .sort((a, b) => (c.creation[b.key] || 0) - (c.creation[a.key] || 0) || rank.get(a.key) - rank.get(b.key))
    .map(skill => skill.key);
}
export function setCreationMethod(c, method) {
  const nextMethod = method === 'priority' ? 'priority' : 'points';
  if (nextMethod === c.creationMethod) return;
  if (nextMethod === 'priority') {
    c.creationPriority = rankCreationPriority(c, availableSkills(c));
  } else if (c.creationMethod === 'priority') {
    c.creation = Object.fromEntries(availableSkills(c).filter(skill => skill.creation > 0).map(skill => [skill.key, skill.creation]));
  }
  c.creationMethod = nextMethod;
}
export function resetSkillValues(c) {
  c.creation = {};
  c.advancement = {};
  c.creationPriority = [];
  if (c.creationMethod === 'priority') c.creationPriority = availableSkills(c).map(skill => skill.key);
}
function priorityAllocations(c, skills, order) {
  const allocations = new Map(skills.map(skill => [skill.key, Math.min(CREATION_LIMIT, c.creation[skill.key] || 0)]));
  let remaining = CREATION_BUDGET - [...allocations.values()].reduce((total, value) => total + value, 0);
  // First pass: allocate points to each skill in order, up to the max of 15 or the remaining budget
  for (const [index, key] of order.entries()) {
    const target = Math.max(allocations.get(key), Math.max(1, CREATION_LIMIT - index));
    const points = Math.min(remaining, target - allocations.get(key));
    allocations.set(key, allocations.get(key) + points);
    remaining -= points;
    if (!remaining) break;
  }
  // Second pass: allocate points to every other skill in order, keeping a staggered pattern
  while (remaining > 0) {
    let capCount = 0;
    for (const [index, key] of order.entries())
      if (allocations.get(key) === CREATION_LIMIT) capCount++;
    if (capCount === order.length) break;
    // Find first skill that has a duplicateCount lower than the cap count
    let startIndex = 0;
    let minimumDuplicateCount = Infinity;
    for (startIndex = 1; startIndex < order.length; startIndex++) {
      let duplicateCount = 0;
      for (let index = 0; index < order.length; index++)
        if (allocations.get(order[index]) === allocations.get(order[startIndex])) duplicateCount++;
      minimumDuplicateCount = Math.min(duplicateCount, minimumDuplicateCount);
      if (duplicateCount < capCount) break;
    }
    // If all skills are at similar duplication counts, just pick the first non-maxed skill to increment
    if (minimumDuplicateCount === capCount) {
      for (startIndex = 0; startIndex < order.length; startIndex++)
        if (allocations.get(order[startIndex]) < CREATION_LIMIT) break;
    }
    else
    {
      startIndex++; // Else it is the following from the first skill that has a lower duplicate count than the cap count
    }
    // Add points up to that current value number of downward skills (respecting remaining)
    let maxIncrements = allocations.get(order[startIndex]);
    for (let index = startIndex; index < startIndex + maxIncrements && remaining > 0; index++) {
      const key = order[index];
      if (allocations.get(key) < CREATION_LIMIT) {
        allocations.set(key, allocations.get(key) + 1);
        remaining--;
      }
    }
  }
  return allocations;
}
export function creationPriorityValue(c, key) {
  return availableSkills(c).find(skill => skill.key === key)?.creation || 0;
}
export function availableSkills(c) {
  const grants = new Map(c.grants.map(g => [skillKey(g.catalogId, g.specialty), g]));
  const skills = CATALOG.filter(s => s.type === 'Standard').map(s => ({ ...s, key: s.id, trained: grants.has(s.id) }));
  for (const [key, grant] of grants) {
    const s = byId.get(grant.catalogId);
    if (s.type === 'Professional') skills.push({ ...s, key, name: s.template ? `${s.name}: ${grant.specialty}` : s.name, trained: true });
  }
  const priorityOrder = c.creationMethod === 'priority' ? normalizeCreationPriority(c, skills) : null;
  const priorityValues = priorityOrder ? priorityAllocations(c, skills, priorityOrder) : null;
  return skills.map(s => {
    const creation = priorityValues ? priorityValues.get(s.key) || 0 : c.creation[s.key] || 0;
    const advancement = c.advancement[s.key] || 0;
    const attributeValue = c.attributes[s.attribute];
    const base = 20 + attributeValue * 5;
    const training = s.trained ? 15 : 0;
    return { ...s, creation, advancement, attributeValue, base, training, total: base + training + creation + advancement };
  }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
export function addGrant(c, catalogId, specialty = '') {
  const s = byId.get(catalogId);
  if (!s) throw new Error('Choose a skill from the catalog.');
  const name = normalizeName(String(specialty));
  if (s.template && (!name || name.length > 80)) throw new Error('Enter a specialty name of up to 80 characters.');
  const key = skillKey(catalogId, s.template ? name : '');
  if (c.grants.some(g => skillKey(g.catalogId, g.specialty) === key)) throw new Error('That skill is already trained.');
  c.grants.push({ catalogId, specialty: s.template ? name : '' });
  return key;
}
export function removeGrant(c, key) {
  const grant = c.grants.find(g => skillKey(g.catalogId, g.specialty) === key);
  if (!grant) return;
  c.grants = c.grants.filter(g => skillKey(g.catalogId, g.specialty) !== key);
  if (byId.get(grant.catalogId).type === 'Professional') { delete c.creation[key]; delete c.advancement[key]; }
}
export function budgets(c) {
  const creationSpent = c.creationMethod === 'priority'
    ? availableSkills(c).reduce((total, skill) => total + skill.creation, 0)
    : Object.values(c.creation).reduce((a, b) => a + b, 0);
  const advancementSpent = Object.values(c.advancement).reduce((a, b) => a + b, 0);
  return { creationSpent, creationRemaining: CREATION_BUDGET - creationSpent, advancementSpent, advancementBudget: c.xp * c.rules.pointsPerXp, advancementRemaining: c.xp * c.rules.pointsPerXp - advancementSpent, advancementLimit: c.level * c.rules.perSkillPerLevel };
}
export function setAllocation(c, phase, key, amount) {
  if (!['creation', 'advancement'].includes(phase)) throw new Error('Unknown allocation phase.');
  if (phase === 'creation' && c.creationMethod === 'priority') throw new Error('Switch back to the 150-point spend to assign numeric creation values.');
  if (!integer(amount)) throw new Error('Use a whole number of points, zero or greater.');
  if (!availableSkills(c).some(s => s.key === key)) throw new Error('A skill grant must unlock this skill first.');
  const current = c[phase][key] || 0;
  if (amount > current) {
    const b = budgets(c);
    const limit = phase === 'creation' ? CREATION_LIMIT : b.advancementLimit;
    const remaining = phase === 'creation' ? b.creationRemaining : b.advancementRemaining;
    if (amount > limit) throw new Error(`This skill allows up to ${limit} ${phase} points.`);
    if (amount - current > remaining) throw new Error(`Only ${Math.max(0, remaining)} ${phase} points remain.`);
  }
  if (amount === 0) delete c[phase][key]; else c[phase][key] = amount;
}
export function issues(c) {
  const b = budgets(c), result = [];
  if (b.creationRemaining < 0) result.push('Creation spending exceeds the 150-point budget.');
  if (b.advancementRemaining < 0) result.push('Advancement spending exceeds the current XP budget. Return points or update XP/settings.');
  for (const s of availableSkills(c)) {
    if (s.creation > CREATION_LIMIT) result.push(`${s.name} exceeds the 15-point creation allowance.`);
    if (s.advancement > b.advancementLimit) result.push(`${s.name} exceeds the current ${b.advancementLimit}-point advancement allowance.`);
  }
  return result;
}
export function validateCharacter(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid character file.');
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 80) throw new Error('A character needs a name of up to 80 characters.');
  if (!integer(raw.level, 1, 10000) || !integer(raw.xp)) throw new Error('Level or XP is invalid.');
  for (const a of ATTRIBUTES) if (!integer(raw.attributes?.[a], -100, 100)) throw new Error(`Invalid ${a} attribute.`);
  for (const r of Object.keys(DEFAULT_RULES)) if (!integer(raw.rules?.[r], 0, 10000)) throw new Error('Invalid campaign settings.');
  if (!Array.isArray(raw.grants) || raw.grants.length > 1000) throw new Error('Invalid skill grants.');
  const c = newCharacter(raw.name.trim());
  if (typeof raw.id === 'string' && raw.id.length < 100 && raw.id) c.id = raw.id;
  c.campaign = typeof raw.campaign === 'string' ? raw.campaign.slice(0, 80) : '';
  c.attributes = Object.fromEntries(ATTRIBUTES.map(a => [a, raw.attributes[a]]));
  c.level = raw.level; c.xp = raw.xp; c.rules = { pointsPerXp: raw.rules.pointsPerXp, perSkillPerLevel: raw.rules.perSkillPerLevel };
  c.creationMethod = raw.creationMethod === 'priority' ? 'priority' : 'points';
  c.creationPriority = Array.isArray(raw.creationPriority) ? raw.creationPriority.filter(Boolean) : [];
  for (const g of raw.grants) {
    if (!g || typeof g.catalogId !== 'string' || typeof g.specialty !== 'string') throw new Error('Invalid skill grant.');
    addGrant(c, g.catalogId, g.specialty);
  }
  const keys = new Set(availableSkills(c).map(s => s.key));
  c.creationPriority = c.creationMethod === 'priority' ? normalizeCreationPriority(c, availableSkills(c)) : [];
  for (const phase of ['creation', 'advancement']) {
    if (!raw[phase] || typeof raw[phase] !== 'object' || Array.isArray(raw[phase])) throw new Error('Invalid allocation data.');
    for (const [key, value] of Object.entries(raw[phase])) {
      if (!keys.has(key) || !integer(value)) throw new Error('Allocation data references an unavailable skill or invalid point amount.');
      c[phase][key] = value;
    }
  }
  c.stage = integer(raw.stage, 0, 4) ? raw.stage : 0;
  return c;
}
export const STORAGE_KEY = 'steel-and-story.characters.v1';
export function loadCharacters(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { characters: [], activeId: null };
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1 || !Array.isArray(parsed.characters) || parsed.characters.length > 1000) throw new Error('Saved character data could not be read.');
  const characters = parsed.characters.map(validateCharacter);
  if (new Set(characters.map(c => c.id)).size !== characters.length) throw new Error('Saved character IDs are duplicated.');
  return { characters, activeId: characters.some(c => c.id === parsed.activeId) ? parsed.activeId : characters[0]?.id || null };
}
export function saveCharacters(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, characters: state.characters, activeId: state.activeId }));
}
