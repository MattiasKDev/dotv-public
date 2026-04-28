const DATA_PATHS = {
  items: ["items.json", "../../storage/stage/items.json"],
  formations: "formations.json",
  inventory: "inventory.json",
};

const INPUT_STORAGE_KEY = "commander-formation-ranker-inputs-v1";
const COMMANDER_ATTACK_MULTIPLIER = 1.8;
const DAMAGE_TYPES = [
  "Acid",
  "Dark",
  "Fire",
  "Holy",
  "Ice",
  "Lightning",
  "Magic",
  "Nature",
  "Physical",
  "Poison",
  "Psychic",
];
const DAMAGE_TYPE_PATTERN = DAMAGE_TYPES.join("|");
const PROC_PATTERN = /(\d+(?:\.\d+)?)%\s+chance(?:\s+on\s+20x attacks)?\s+to\s+proc\s+([^;]+)/i;
const OWNED_DAMAGE_PATTERN = /\+\s*(\d[\d,]*(?:\.\d+)?)\s+(?:(?:[A-Za-z]+)\s+)?damage\s+per\s+(.+)/i;
const FORMATION_DAMAGE_PATTERN = /\+\s*(\d[\d,]*(?:\.\d+)?)\s+(?:(?:[A-Za-z]+)\s+)?damage\s+per\s+(.+?)\s+in\s+the\s+Formation\b/i;
const DAMAGE_PATTERN = new RegExp(
  `(\\d[\\d,]*(?:\\.\\d+)?)(?:\\s*-\\s*(\\d[\\d,]*(?:\\.\\d+)?))?\\s+(?:${DAMAGE_TYPE_PATTERN})\\s+damage\\b`,
  "ig",
);
const RESOURCE_PATTERN = /\+\s*(\d[\d,]*(?:\.\d+)?)\s*(?:to\s+Player\s+|Player\s+)?(Honor|Honour|Energy|Vitality)\b/ig;
const OWNED_STAT_GAIN_PATTERN = /Gains\s+(.+?)\s+per\s+(.+)/i;
const STAT_AMOUNT_PATTERN = /\+\s*(\d[\d,]*(?:\.\d+)?)\s+(Attack|Defence|Defense)\b/ig;
const FLAT_FORMATION_BONUS_PATTERN = /(?:Adds\s+)?([+-]?\d[\d,]*(?:\.\d+)?)%\s+Formation Bonus\b/ig;
const SCALING_FORMATION_BONUS_PATTERN = /([+-]?\d[\d,]*(?:\.\d+)?)%\s+Formation Bonus\s+for\s+every\s+(\d[\d,]*)\s+distinct\s+Formations?\s+owned/ig;
const ACTIVE_FORMATION_PROTECT_PATTERN = /([+-]?\d[\d,]*(?:\.\d+)?)\s+Formation Protection Value\s+to\s+(?:the\s+)?active Formation\b/ig;
const PASSIVE_FORMATION_BONUS_PATTERNS = [
  /Passive\s+([+-]?\d[\d,]*(?:\.\d+)?)%\s+Formation Bonus\b/ig,
  /([+-]?\d[\d,]*(?:\.\d+)?)%\s+Passive Formation Bonus\b/ig,
  /Passively increases Formation Bonus by\s+([+-]?\d[\d,]*(?:\.\d+)?)%/ig,
];
const PASSIVE_FORMATION_PROTECT_PATTERNS = [
  /Passive\s+([+-]?\d[\d,]*(?:\.\d+)?)\s+Formation Protection Value\b/ig,
  /Passively increases Formation Protection Value by\s+([+-]?\d[\d,]*(?:\.\d+)?)/ig,
];
const SCORE_SCALE = 1000000;

const state = {
  items: {},
  formations: {},
  dataSources: {
    items: "bundled items.json",
    formations: "bundled formations.json",
  },
  inventoryIds: new Set(),
  inventoryQuantities: new Map(),
  defaultInventoryText: "",
  preferredFormationId: "",
  activeTab: "optimizer",
  bonusFormationPower: 2700,
  bonusFormationBonus: 0,
  bonusFormationProtect: 0,
  leadershipStat: 0,
  leadershipFormationPower: 0,
  alwaysUseCommanderIds: [],
  commanders: [],
  ownedFormations: [],
  passiveFormationBonus: 0,
  passiveFormationBonuses: [],
  passiveFormationProtect: 0,
  passiveFormationProtectBonuses: [],
  selectedResult: null,
};

const els = {
  inputsTab: document.getElementById("inputsTab"),
  optimizerTab: document.getElementById("optimizerTab"),
  inputsPanel: document.getElementById("inputsPanel"),
  optimizerPanel: document.getElementById("optimizerPanel"),
  inventoryInput: document.getElementById("inventoryInput"),
  itemsFileInput: document.getElementById("itemsFileInput"),
  formationsFileInput: document.getElementById("formationsFileInput"),
  dataSourceMeta: document.getElementById("dataSourceMeta"),
  bonusFpInput: document.getElementById("bonusFpInput"),
  bonusFbInput: document.getElementById("bonusFbInput"),
  bonusProtInput: document.getElementById("bonusProtInput"),
  leadershipInput: document.getElementById("leadershipInput"),
  alwaysUseSelect: document.getElementById("alwaysUseSelect"),
  addAlwaysUse: document.getElementById("addAlwaysUse"),
  alwaysUseList: document.getElementById("alwaysUseList"),
  leadershipFp: document.getElementById("leadershipFp"),
  totalBaseFp: document.getElementById("totalBaseFp"),
  applyInputs: document.getElementById("applyInputs"),
  inputStatus: document.getElementById("inputStatus"),
  priority: document.getElementById("priority"),
  formationSelect: document.getElementById("formationSelect"),
  minimumDef: document.getElementById("minimumDef"),
  findBest: document.getElementById("findBest"),
  nextBest: document.getElementById("nextBest"),
  protectValue: document.getElementById("protectValue"),
  protectMeta: document.getElementById("protectMeta"),
  formationPower: document.getElementById("formationPower"),
  formationPowerMeta: document.getElementById("formationPowerMeta"),
  effectAvg: document.getElementById("effectAvg"),
  effectAvgMeta: document.getElementById("effectAvgMeta"),
  selectedScore: document.getElementById("selectedScore"),
  selectedMeta: document.getElementById("selectedMeta"),
  selectedName: document.getElementById("selectedName"),
  selectedSlots: document.getElementById("selectedSlots"),
  passiveMeta: document.getElementById("passiveMeta"),
  passiveList: document.getElementById("passiveList"),
  rosterRows: document.getElementById("rosterRows"),
  rosterMeta: document.getElementById("rosterMeta"),
};

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

async function loadJsonFrom(paths) {
  const candidates = Array.isArray(paths) ? paths : [paths];
  let lastError = null;

  for (const path of candidates) {
    try {
      return await loadJson(path);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function loadOptionalJson(path, fallback) {
  try {
    return await loadJson(path);
  } catch {
    return fallback;
  }
}

function readStoredInputs() {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(INPUT_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeStoredInputs(values) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(INPUT_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Storage can be unavailable in private contexts; the optimizer still works without it.
  }
}

async function readJsonFile(file) {
  return JSON.parse(await file.text());
}

function itemCount(value) {
  return value && typeof value === "object" ? Object.keys(value).length : 0;
}

function renderDataSourceMeta() {
  els.dataSourceMeta.textContent = `${state.dataSources.items} (${itemCount(state.items)} items) / ${state.dataSources.formations} (${itemCount(state.formations)} formations)`;
}

function applyLoadedDataFile(kind, data, fileName) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${fileName} must be a JSON object`);
  }

  if (kind === "items") {
    state.items = data;
    state.dataSources.items = fileName;
  } else {
    state.formations = data;
    state.dataSources.formations = fileName;
  }

  initializeData();
  renderAll();
  renderDataSourceMeta();
  setInputStatus(`${fileName} loaded`, false);
}

async function loadDataFile(kind, file) {
  if (!file) return;

  try {
    applyLoadedDataFile(kind, await readJsonFile(file), file.name);
  } catch (error) {
    setInputStatus(error.message, true);
  }
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function inventoryQuantity(itemId) {
  if (!state.inventoryIds.has(itemId)) return 0;
  return state.inventoryQuantities.has(itemId) ? state.inventoryQuantities.get(itemId) : 1;
}

function quantityFromInventoryValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return 0;

  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : 1;
}

function parseInventoryData(data) {
  const inventoryIds = new Set();
  const inventoryQuantities = new Map();

  if (Array.isArray(data)) {
    for (const entry of data) {
      if (Array.isArray(entry)) {
        if (!entry.length) throw new Error("Inventory tuples must include an item id");
        const itemId = String(entry[0]);
        inventoryIds.add(itemId);
        inventoryQuantities.set(itemId, quantityFromInventoryValue(entry[1] ?? 1));
      } else {
        const itemId = String(entry);
        inventoryIds.add(itemId);
        inventoryQuantities.set(itemId, 1);
      }
    }

    return { inventoryIds, inventoryQuantities };
  }

  if (data && typeof data === "object") {
    for (const [itemId, quantity] of Object.entries(data)) {
      if (typeof quantity === "boolean") {
        if (quantity) inventoryIds.add(String(itemId));
      } else if (typeof quantity === "number") {
        inventoryIds.add(String(itemId));
      } else if (quantity) {
        inventoryIds.add(String(itemId));
      }
      if (inventoryIds.has(String(itemId))) {
        inventoryQuantities.set(String(itemId), quantityFromInventoryValue(quantity));
      }
    }
    return { inventoryIds, inventoryQuantities };
  }

  throw new Error("Inventory must be a JSON array, tuple array, or object");
}

function formatInventoryArrayEntry(entry) {
  if (Array.isArray(entry)) {
    return `[${entry.map((value) => JSON.stringify(value)).join(", ")}]`;
  }
  return JSON.stringify(entry);
}

function formatInventoryText(data) {
  if (!Array.isArray(data)) return JSON.stringify(data, null, 2);
  if (!data.length) return "[]";

  return `[\n${data.map((entry, index) => {
    const comma = index === data.length - 1 ? "" : ",";
    return `  ${formatInventoryArrayEntry(entry)}${comma}`;
  }).join("\n")}\n]`;
}

function leadershipToFormationPower(leadership) {
  if (leadership <= 1000) return leadership / 5;
  if (leadership <= 10000) return 200 + (leadership - 1000) / 8;
  if (leadership <= 25000) return 1325 + (leadership - 10000) / 10;
  if (leadership <= 50000) return 2825 + (leadership - 25000) / 12;
  if (leadership <= 100000) return 4908 + (leadership - 50000) / 16;
  if (leadership <= 500000) return 8033 + (leadership - 100000) / 20;
  if (leadership <= 5000000) return 28033 + (leadership - 500000) / 25;
  if (leadership <= 20000000) return 208033 + (leadership - 5000000) / 40;
  return 583033 + (leadership - 20000000) / 50;
}

function inputFormationPowerBase() {
  return state.bonusFormationPower + state.leadershipFormationPower;
}

function currentInputValues() {
  return {
    inventoryText: els.inventoryInput.value,
    bonusFp: els.bonusFpInput.value,
    bonusFb: els.bonusFbInput.value,
    bonusProt: els.bonusProtInput.value,
    leadership: els.leadershipInput.value,
    priority: els.priority.value,
    minimumDef: els.minimumDef.value,
    formationId: els.formationSelect.value || state.preferredFormationId,
    activeTab: state.activeTab,
    alwaysUseCommanderIds: state.alwaysUseCommanderIds,
  };
}

function saveInputValues() {
  writeStoredInputs(currentInputValues());
}

function updateInputDerivedMetrics() {
  const bonusFp = toNumber(els.bonusFpInput.value);
  const leadership = Math.max(0, toNumber(els.leadershipInput.value));
  const leadershipFp = leadershipToFormationPower(leadership);

  els.leadershipFp.textContent = formatStat(leadershipFp);
  els.totalBaseFp.textContent = formatStat(bonusFp + leadershipFp);
}

function initializeInputFields(defaultInventory) {
  const stored = readStoredInputs();
  state.defaultInventoryText = formatInventoryText(defaultInventory);
  state.preferredFormationId = String(stored.formationId ?? "");
  state.activeTab = stored.activeTab === "inputs" ? "inputs" : "optimizer";

  els.inventoryInput.value = typeof stored.inventoryText === "string"
    ? stored.inventoryText
    : state.defaultInventoryText;
  els.bonusFpInput.value = stored.bonusFp ?? "2700";
  els.bonusFbInput.value = stored.bonusFb ?? "0";
  els.bonusProtInput.value = stored.bonusProt ?? "0";
  els.leadershipInput.value = stored.leadership ?? "0";
  els.priority.value = stored.priority === "bonusres" ? "bonusres" : "dmgscore";
  els.minimumDef.value = stored.minimumDef ?? "0";
  state.alwaysUseCommanderIds = Array.isArray(stored.alwaysUseCommanderIds)
    ? stored.alwaysUseCommanderIds.map(String)
    : [];
  updateInputDerivedMetrics();
}

function setInputStatus(message, isError = false) {
  els.inputStatus.textContent = message;
  els.inputStatus.classList.toggle("error", isError);
}

function commanderById(id) {
  return state.commanders.find((commander) => commander.id === id) || null;
}

function activeAlwaysUseIds() {
  return selectedPriority() === "dmgscore" ? state.alwaysUseCommanderIds : [];
}

function activeAlwaysUseCommanders() {
  const ids = new Set(activeAlwaysUseIds());
  return state.commanders.filter((commander) => ids.has(commander.id));
}

function addAlwaysUseCommander() {
  const commanderId = els.alwaysUseSelect.value;
  if (!commanderId || state.alwaysUseCommanderIds.includes(commanderId)) return;

  state.alwaysUseCommanderIds.push(commanderId);
  renderAll();
  saveInputValues();
}

function removeAlwaysUseCommander(commanderId) {
  state.alwaysUseCommanderIds = state.alwaysUseCommanderIds.filter((id) => id !== commanderId);
  renderAll();
  saveInputValues();
}

function renderAlwaysUseControls() {
  const selectedIds = new Set(state.alwaysUseCommanderIds);
  const availableCommanders = state.commanders
    .filter((commander) => !selectedIds.has(commander.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  els.alwaysUseSelect.innerHTML = "";
  if (availableCommanders.length) {
    for (const commander of availableCommanders) {
      const option = document.createElement("option");
      option.value = commander.id;
      option.textContent = commander.name;
      els.alwaysUseSelect.append(option);
    }
    els.alwaysUseSelect.disabled = false;
    els.addAlwaysUse.disabled = false;
  } else {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = state.commanders.length ? "All owned commanders selected" : "No owned commanders";
    els.alwaysUseSelect.append(option);
    els.alwaysUseSelect.disabled = true;
    els.addAlwaysUse.disabled = true;
  }

  els.alwaysUseList.innerHTML = "";
  const selectedCommanders = state.alwaysUseCommanderIds
    .map((commanderId) => commanderById(commanderId))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!selectedCommanders.length) {
    const empty = document.createElement("div");
    empty.className = "status compact-status";
    empty.textContent = "None selected";
    els.alwaysUseList.append(empty);
    return;
  }

  for (const commander of selectedCommanders) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span>${commander.name}</span>
      <button type="button" data-remove-always-use="${commander.id}" aria-label="Remove ${commander.name}">x</button>
    `;
    els.alwaysUseList.append(chip);
  }
}

function switchTab(tabName) {
  state.activeTab = tabName === "inputs" ? "inputs" : "optimizer";
  const isInputs = state.activeTab === "inputs";

  els.inputsPanel.hidden = !isInputs;
  els.optimizerPanel.hidden = isInputs;
  els.inputsTab.classList.toggle("active", isInputs);
  els.optimizerTab.classList.toggle("active", !isInputs);
  saveInputValues();
}

function applyInputValues({ save = true } = {}) {
  let parsedInventory;
  try {
    parsedInventory = parseInventoryData(JSON.parse(els.inventoryInput.value));
  } catch (error) {
    setInputStatus(error.message, true);
    return false;
  }

  state.inventoryIds = parsedInventory.inventoryIds;
  state.inventoryQuantities = parsedInventory.inventoryQuantities;
  state.bonusFormationPower = toNumber(els.bonusFpInput.value);
  state.bonusFormationBonus = toNumber(els.bonusFbInput.value);
  state.bonusFormationProtect = toNumber(els.bonusProtInput.value);
  state.leadershipStat = Math.max(0, toNumber(els.leadershipInput.value));
  state.leadershipFormationPower = leadershipToFormationPower(state.leadershipStat);
  state.preferredFormationId = els.formationSelect.value || state.preferredFormationId;

  updateInputDerivedMetrics();
  initializeData();
  renderAll();
  setInputStatus(`${state.inventoryIds.size} items applied`, false);
  if (save) saveInputValues();
  return true;
}

function parseNumber(value) {
  return Number(String(value).replaceAll(",", ""));
}

function formatStat(value) {
  const nearestInt = Math.round(value);
  if (Math.abs(value - nearestInt) < 0.000001) return String(nearestInt);
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function formatDmgscore(value) {
  return Number(value).toFixed(1);
}

function formatPercent(value) {
  return `${formatStat(value)}%`;
}

function formatSignedPercent(value) {
  return `${value >= 0 ? "+" : ""}${formatPercent(value)}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function itemText(item) {
  return ["id", "name", "effectName", "effects", "description"]
    .map((field) => String(item?.[field] ?? ""))
    .join(" ")
    .toLowerCase();
}

function countOwnedItemSet(theme) {
  const setId = `is.${slugify(theme)}`;
  let count = 0;
  for (const itemId of state.inventoryIds) {
    const item = state.items[itemId];
    if (item && Array.isArray(item.itemSetIds) && item.itemSetIds.includes(setId)) {
      count += 1;
    }
  }
  return count;
}

function countOwnedThemedMagic(theme) {
  const themeSlug = slugify(theme);
  const themeWords = new Set(themeSlug.split("-").filter(Boolean));
  let count = 0;

  for (const itemId of state.inventoryIds) {
    if (!itemId.startsWith("m.")) continue;
    const item = state.items[itemId];
    if (!item) continue;

    const textSlug = slugify(itemText(item));
    const textWords = new Set(textSlug.split("-").filter(Boolean));
    const hasAllWords = [...themeWords].every((word) => textWords.has(word));
    if (textSlug.includes(themeSlug) || hasAllWords) count += 1;
  }

  return count;
}

function countOwnedThemedFormations(theme) {
  const themeSlug = slugify(theme);
  let count = 0;
  for (const itemId of state.inventoryIds) {
    if (itemId.startsWith("f.") && itemId.includes(themeSlug)) count += 1;
  }
  return count;
}

function countOwnedByPredicate(predicate) {
  let count = 0;
  for (const itemId of state.inventoryIds) {
    const item = state.items[itemId];
    if (item && predicate(item)) count += 1;
  }
  return count;
}

function countOwnedScalingTarget(target) {
  const normalized = target
    .replace(/\bowned\b/ig, "")
    .replace(/\bdistinct\b/ig, "")
    .trim()
    .replace(/\.$/, "");
  const lowered = normalized.toLowerCase();
  const setItemMatch = normalized.match(/(.+?)\s+set item\b/i);

  if (setItemMatch) {
    const theme = setItemMatch[1].trim();
    const remainder = normalized.slice(setItemMatch.index + setItemMatch[0].length);
    let count = countOwnedItemSet(theme);
    if (/\bmagic\b/i.test(remainder)) count += countOwnedThemedMagic(theme);
    if (/\bformation\b/i.test(remainder)) count += countOwnedThemedFormations(theme);
    return count;
  }

  if (lowered.includes("formation")) {
    return [...state.inventoryIds].filter((itemId) => itemId.startsWith("f.")).length;
  }
  if (lowered.includes("troop")) {
    return countOwnedByPredicate((item) => item.type === "troop" && String(item.id ?? "").startsWith("a."));
  }
  if (lowered.includes("ring")) {
    return countOwnedByPredicate((item) => item.equipSlot === "ring" || item.equipType === "ring");
  }
  if (lowered.includes("buckler shield")) {
    return countOwnedByPredicate((item) => item.equipType === "buckler-shield");
  }
  if (lowered.includes("medium shield")) {
    return countOwnedByPredicate((item) => item.equipType === "medium-shield");
  }
  if (lowered.includes("tower shield")) {
    return countOwnedByPredicate((item) => item.equipType === "tower-shield");
  }

  return 0;
}

function calculateOwnedScalingDamage(segment) {
  const match = segment.match(OWNED_DAMAGE_PATTERN);
  if (!match || !/\bowned\b/i.test(match[2])) return 0;
  return parseNumber(match[1]) * countOwnedScalingTarget(match[2]);
}

function isConditionalProc(body) {
  return /\bvs\b|\braids?\s+with\b/i.test(body);
}

function damageTotal(body) {
  let total = 0;
  DAMAGE_PATTERN.lastIndex = 0;
  for (const match of body.matchAll(DAMAGE_PATTERN)) {
    const low = parseNumber(match[1]);
    const high = match[2] ? parseNumber(match[2]) : null;
    total += high === null ? low : (low + high) / 2;
  }
  return total;
}

function calculateEffectAverage(effects) {
  let total = 0;
  let currentProc = null;

  for (const rawSegment of String(effects ?? "").split(";")) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    const procMatch = segment.match(PROC_PATTERN);
    if (procMatch) {
      if (currentProc) total += currentProc.chance * currentProc.damage;

      const body = procMatch[2];
      if (isConditionalProc(body)) {
        currentProc = null;
        continue;
      }

      const damage = damageTotal(body);
      currentProc = damage ? { chance: parseNumber(procMatch[1]) / 100, damage } : null;
      continue;
    }

    if (currentProc) {
      currentProc.damage += calculateOwnedScalingDamage(segment);
    }
  }

  if (currentProc) total += currentProc.chance * currentProc.damage;
  return total;
}

function splitFormationTargets(target) {
  return String(target ?? "")
    .replace(/\bin\s+the\s+Formation\b/ig, "")
    .replace(/\bthe\b/ig, "")
    .split(/\s*(?:,|\bor\b|\band\b)\s*/i)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function commanderMatchesFormationTarget(commander, target) {
  const normalized = String(target ?? "")
    .replace(/\bArmy Units?\b/ig, "")
    .trim();
  if (!normalized) return false;

  const targetSlug = slugify(normalized);
  if (targetSlug === slugify(commander.name)) return true;

  return [commander.race, commander.role, commander.trait]
    .filter((value) => value && value !== "any")
    .some((value) => slugify(value) === targetSlug);
}

function countFormationTarget(target, commanders) {
  const targets = splitFormationTargets(target);
  if (!targets.length) return 0;

  return commanders.reduce((count, commander) => (
    count + (targets.some((targetPiece) => commanderMatchesFormationTarget(commander, targetPiece)) ? 1 : 0)
  ), 0);
}

function formationEffectRules(effects) {
  const rules = [];
  let currentChance = 0;

  for (const rawSegment of String(effects ?? "").split(";")) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    const procMatch = segment.match(PROC_PATTERN);
    if (procMatch) {
      currentChance = isConditionalProc(procMatch[2]) ? 0 : parseNumber(procMatch[1]) / 100;
      continue;
    }

    if (!currentChance || /\bvs\b|\braids?\b/i.test(segment)) continue;

    const formationDamageMatch = segment.match(FORMATION_DAMAGE_PATTERN);
    if (formationDamageMatch) {
      rules.push({
        chance: currentChance,
        amount: parseNumber(formationDamageMatch[1]),
        target: formationDamageMatch[2],
      });
    }
  }

  return rules;
}

function calculateFormationEffectAverage(effects, commanders) {
  let total = 0;
  let currentProc = null;

  for (const rawSegment of String(effects ?? "").split(";")) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    const procMatch = segment.match(PROC_PATTERN);
    if (procMatch) {
      if (currentProc) total += currentProc.chance * currentProc.damage;

      const body = procMatch[2];
      if (isConditionalProc(body)) {
        currentProc = null;
        continue;
      }

      const damage = damageTotal(body);
      currentProc = damage ? { chance: parseNumber(procMatch[1]) / 100, damage } : null;
      continue;
    }

    if (!currentProc || /\bvs\b|\braids?\b/i.test(segment)) continue;

    const formationDamageMatch = segment.match(FORMATION_DAMAGE_PATTERN);
    if (formationDamageMatch) {
      currentProc.damage += parseNumber(formationDamageMatch[1])
        * countFormationTarget(formationDamageMatch[2], commanders);
    }
  }

  if (currentProc) total += currentProc.chance * currentProc.damage;
  return total;
}

function commanderFormationEffectContribution(commander, rules) {
  return rules.reduce((sum, rule) => (
    commanderMatchesFormationTarget(commander, rule.target)
      ? sum + rule.chance * rule.amount
      : sum
  ), 0);
}

function normalizeResourceName(resource) {
  return resource.toLowerCase() === "honour" ? "honor" : resource.toLowerCase();
}

function calculateBonusResources(effects) {
  const resources = { honor: 0, energy: 0, vitality: 0 };

  for (const rawSegment of String(effects ?? "").split(";")) {
    const segment = rawSegment.trim();
    if (!segment || /\bper\b/i.test(segment)) continue;

    RESOURCE_PATTERN.lastIndex = 0;
    for (const match of segment.matchAll(RESOURCE_PATTERN)) {
      resources[normalizeResourceName(match[2])] += parseNumber(match[1]);
    }
  }

  return resources;
}

function normalizeStatName(statName) {
  return statName.toLowerCase() === "attack" ? "att" : "defense";
}

function calculateOwnedStatGains(effects) {
  const gains = { att: 0, defense: 0 };

  for (const rawSegment of String(effects ?? "").split(";")) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    const gainMatch = segment.match(OWNED_STAT_GAIN_PATTERN);
    if (!gainMatch || !/\bowned\b/i.test(gainMatch[2])) continue;

    const count = countOwnedScalingTarget(gainMatch[2]);
    STAT_AMOUNT_PATTERN.lastIndex = 0;
    for (const statMatch of gainMatch[1].matchAll(STAT_AMOUNT_PATTERN)) {
      gains[normalizeStatName(statMatch[2])] += parseNumber(statMatch[1]) * count;
    }
  }

  return gains;
}

function calculateDamageScore(commander, formationBonusPercent) {
  const formationMultiplier = 1 + formationBonusPercent / 100;
  return commander.att * COMMANDER_ATTACK_MULTIPLIER * formationMultiplier + commander.effectavg;
}

function commanderFormationPowerBase(commander) {
  return commander.att * COMMANDER_ATTACK_MULTIPLIER;
}

function ownedFormationCount() {
  return [...state.inventoryIds].filter((itemId) => itemId.startsWith("f.")).length;
}

function extractActiveFormationBonus(effects) {
  let total = 0;
  const parts = [];
  const formationCount = ownedFormationCount();

  for (const rawSegment of String(effects ?? "").split(";")) {
    const segment = rawSegment.trim();
    if (!segment || /\bpassive(?:ly)?\b/i.test(segment)) continue;
    if (/\bproc\b|\bon that hit\b|\bSet Bonus\b|\bworn\b/i.test(segment)) continue;

    let matchedScaling = false;
    SCALING_FORMATION_BONUS_PATTERN.lastIndex = 0;
    for (const match of segment.matchAll(SCALING_FORMATION_BONUS_PATTERN)) {
      const amount = parseNumber(match[1]);
      const every = parseNumber(match[2]);
      if (!amount || !every) continue;

      matchedScaling = true;
      const count = Math.floor(formationCount / every);
      const value = amount * count;
      if (value > 0) {
        total += value;
        parts.push({
          amount: value,
          label: `${formatSignedPercent(value)} from ${formationCount} formations`,
        });
      }
    }

    if (matchedScaling) continue;

    FLAT_FORMATION_BONUS_PATTERN.lastIndex = 0;
    for (const match of segment.matchAll(FLAT_FORMATION_BONUS_PATTERN)) {
      const amount = parseNumber(match[1]);
      if (amount > 0) {
        total += amount;
        parts.push({ amount, label: formatSignedPercent(amount) });
      }
    }
  }

  return { total, parts };
}

function extractActiveFormationProtect(effects) {
  let total = 0;
  const parts = [];

  for (const rawSegment of String(effects ?? "").split(";")) {
    const segment = rawSegment.trim();
    if (!segment || /\bpassive(?:ly)?\b/i.test(segment)) continue;

    ACTIVE_FORMATION_PROTECT_PATTERN.lastIndex = 0;
    for (const match of segment.matchAll(ACTIVE_FORMATION_PROTECT_PATTERN)) {
      const amount = parseNumber(match[1]);
      if (amount > 0) {
        total += amount;
        parts.push({ amount, label: `+${formatStat(amount)} prot` });
      }
    }
  }

  return { total, parts };
}

function extractPassiveFormationBonuses(item) {
  const text = `${item?.effects ?? ""}\n${item?.description ?? ""}`;
  const bonuses = [];

  for (const pattern of PASSIVE_FORMATION_BONUS_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const amount = parseNumber(match[1]);
      if (amount > 0) {
        bonuses.push({
          itemId: String(item.id ?? ""),
          itemName: String(item.name ?? item.id ?? "Unknown"),
          amount,
        });
      }
    }
  }

  return bonuses;
}

function extractPassiveFormationProtectBonuses(item) {
  const text = `${item?.effects ?? ""}\n${item?.description ?? ""}`;
  const bonuses = [];

  for (const pattern of PASSIVE_FORMATION_PROTECT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const amount = parseNumber(match[1]);
      if (amount > 0) {
        bonuses.push({
          itemId: String(item.id ?? ""),
          itemName: String(item.name ?? item.id ?? "Unknown"),
          amount,
        });
      }
    }
  }

  return bonuses;
}

function buildPassiveFormationBonuses() {
  const bonuses = [];
  const seen = new Set();

  for (const itemId of state.inventoryIds) {
    const item = state.items[itemId];
    if (!item) continue;

    for (const bonus of extractPassiveFormationBonuses(item)) {
      const key = `${bonus.itemId}:${bonus.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bonuses.push(bonus);
    }
  }

  bonuses.sort((a, b) => b.amount - a.amount || a.itemName.localeCompare(b.itemName));
  return bonuses;
}

function buildPassiveFormationProtectBonuses() {
  const bonuses = [];
  const seen = new Set();

  for (const itemId of state.inventoryIds) {
    const item = state.items[itemId];
    if (!item) continue;

    for (const bonus of extractPassiveFormationProtectBonuses(item)) {
      const key = `${bonus.itemId}:${bonus.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bonuses.push(bonus);
    }
  }

  bonuses.sort((a, b) => b.amount - a.amount || a.itemName.localeCompare(b.itemName));
  return bonuses;
}

function isCommander(itemId, item) {
  const canonicalId = item?.id ?? itemId;
  return typeof canonicalId === "string"
    && canonicalId.startsWith("a.")
    && item?.type === "commander";
}

function buildCommander(item) {
  const effects = String(item.effects ?? "");
  const statGains = calculateOwnedStatGains(effects);
  const att = toNumber(item.att) + statGains.att;
  const defense = toNumber(item.def) + statGains.defense;
  const effectavg = calculateEffectAverage(effects);
  const bonusResources = calculateBonusResources(effects);
  const formationBonus = extractActiveFormationBonus(effects);
  const formationProtect = extractActiveFormationProtect(effects);
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? item.id ?? "Unknown"),
    race: String(item.race ?? ""),
    role: String(item.role ?? ""),
    trait: String(item.trait ?? ""),
    att,
    defense,
    health: toNumber(item.health),
    bonus_honor: bonusResources.honor,
    bonus_energy: bonusResources.energy,
    bonus_vitality: bonusResources.vitality,
    bonusres: bonusResources.honor + bonusResources.energy + bonusResources.vitality,
    formationBonus: formationBonus.total,
    formationBonusParts: formationBonus.parts,
    formationProtect: formationProtect.total,
    formationProtectParts: formationProtect.parts,
    effectavg,
    effects,
  };
}

function priorityValue(commander, priority, formationBonusPercent = 0) {
  return priority === "bonusres" ? commander.bonusres : calculateDamageScore(commander, formationBonusPercent);
}

function tiebreakValue(commander, priority, formationBonusPercent = 0) {
  return priority === "bonusres" ? calculateDamageScore(commander, formationBonusPercent) : commander.bonusres;
}

function encodedWeight(commander, priority, formationBonusPercent = 0) {
  return priorityValue(commander, priority, formationBonusPercent) * SCORE_SCALE
    + tiebreakValue(commander, priority, formationBonusPercent);
}

function slotRequirements(slot) {
  const pieces = [];
  if (slot.race && slot.race !== "any") pieces.push(slot.race);
  if (slot.role && slot.role !== "any") pieces.push(slot.role);
  if (slot.trait && slot.trait !== "any") pieces.push(slot.trait);
  if (slot.unitID) pieces.push(slot.unitID);
  return pieces.join(" / ") || "any";
}

function commanderFitsSlot(commander, slot, minimumDef) {
  if (commander.defense < minimumDef) return false;
  if (slot.unitID && commander.id !== slot.unitID) return false;
  if (slot.race && slot.race !== "any" && commander.race !== "any" && commander.race !== slot.race) return false;
  if (slot.role && slot.role !== "any" && commander.role !== "any" && commander.role !== slot.role) return false;
  if (slot.trait && slot.trait !== "any" && commander.trait !== "any" && commander.trait !== slot.trait) return false;
  return true;
}

function formationBaseBonus(formation) {
  return toNumber(formation?.bonus);
}

function formationProtect(formation) {
  return toNumber(formation?.protect);
}

function buildResult(formation, slots, assignments, priority) {
  const selectedCommanders = assignments.filter(Boolean);
  const activeFormationBonus = selectedCommanders.reduce(
    (sum, commander) => sum + commander.formationBonus,
    0,
  );
  const activeFormationProtect = selectedCommanders.reduce(
    (sum, commander) => sum + commander.formationProtect,
    0,
  );
  const baseFormationBonus = formationBaseBonus(formation);
  const totalFormationBonus = baseFormationBonus + state.passiveFormationBonus + activeFormationBonus;
  const baseProtect = formationProtect(formation);
  const totalProtect = baseProtect + state.passiveFormationProtect + activeFormationProtect;
  const commanderPowerBase = selectedCommanders.reduce(
    (sum, commander) => sum + commanderFormationPowerBase(commander),
    0,
  );
  const inputPowerBase = inputFormationPowerBase();
  const formationPowerBase = commanderPowerBase + inputPowerBase;
  const formationPower = formationPowerBase * (1 + totalFormationBonus / 100);
  const commanderEffectAvg = selectedCommanders.reduce(
    (sum, commander) => sum + commander.effectavg,
    0,
  );
  const formationEffectAvg = calculateFormationEffectAverage(formation.effects, selectedCommanders);
  const totalEffectAvg = commanderEffectAvg + formationEffectAvg;
  const totalDmgscore = formationPower + totalEffectAvg;
  const totalBonusres = selectedCommanders.reduce((sum, commander) => sum + commander.bonusres, 0);

  return {
    formation,
    slots,
    assignments,
    filledSlots: selectedCommanders.length,
    baseFormationBonus,
    passiveFormationBonus: state.passiveFormationBonus,
    activeFormationBonus,
    totalFormationBonus,
    baseProtect,
    passiveFormationProtect: state.passiveFormationProtect,
    activeFormationProtect,
    protect: totalProtect,
    commanderFormationPowerBase: commanderPowerBase,
    inputPowerBase,
    formationPowerBase,
    formationPower,
    commanderEffectAvg,
    formationEffectAvg,
    totalEffectAvg,
    totalDmgscore,
    totalBonusres,
    primaryScore: priority === "bonusres" ? totalBonusres : totalDmgscore,
  };
}

function estimateFormationAttack(formation, minimumDef) {
  const slots = [...(formation.expandedCmdrSlots || [])].sort((a, b) => toNumber(a.index) - toNumber(b.index));
  const eligibleCommanders = state.commanders
    .filter((commander) => slots.some((slot) => commanderFitsSlot(commander, slot, minimumDef)))
    .sort((a, b) => b.att - a.att);
  return eligibleCommanders
    .slice(0, slots.length)
    .reduce((sum, commander) => sum + commander.att, 0);
}

function requiredPlacementSeeds(slots, requiredCommanders, minimumDef, weightFn) {
  const slotCount = slots.length;
  const maskCount = 1 << slotCount;

  if (!requiredCommanders.length) return [{ mask: 0, score: 0, path: null }];
  if (requiredCommanders.length > slotCount) return [];

  let scores = new Float64Array(maskCount);
  let paths = Array(maskCount).fill(null);
  scores.fill(Number.NEGATIVE_INFINITY);
  scores[0] = 0;

  for (const commander of requiredCommanders) {
    const nextScores = new Float64Array(maskCount);
    const nextPaths = Array(maskCount).fill(null);
    const weight = weightFn(commander);

    nextScores.fill(Number.NEGATIVE_INFINITY);
    for (let mask = 0; mask < maskCount; mask += 1) {
      if (!Number.isFinite(scores[mask])) continue;

      slots.forEach((slot, slotIndex) => {
        const bit = 1 << slotIndex;
        if (mask & bit) return;
        if (!commanderFitsSlot(commander, slot, minimumDef)) return;

        const newMask = mask | bit;
        const score = scores[mask] + weight;
        if (score > nextScores[newMask]) {
          nextScores[newMask] = score;
          nextPaths[newMask] = {
            previous: paths[mask],
            slotIndex,
            commander,
          };
        }
      });
    }

    scores = nextScores;
    paths = nextPaths;
  }

  const seeds = [];
  for (let mask = 0; mask < maskCount; mask += 1) {
    if (Number.isFinite(scores[mask])) {
      seeds.push({ mask, score: scores[mask], path: paths[mask] });
    }
  }
  return seeds;
}

function formationCanFitRequiredCommanders(formation, requiredCommanders, minimumDef) {
  if (!requiredCommanders.length) return true;
  const slots = [...(formation.expandedCmdrSlots || [])].sort((a, b) => toNumber(a.index) - toNumber(b.index));
  return requiredPlacementSeeds(slots, requiredCommanders, minimumDef, () => 0).length > 0;
}

function visibleOwnedFormations() {
  const requiredCommanders = activeAlwaysUseCommanders();
  const minimumDef = selectedMinimumDef();
  if (!requiredCommanders.length) return state.ownedFormations;

  return state.ownedFormations.filter((formation) => (
    formationCanFitRequiredCommanders(formation, requiredCommanders, minimumDef)
  ));
}

function arrangeAssignmentsByDefense(slots, assignments, minimumDef) {
  const selectedCommanders = assignments
    .filter(Boolean)
    .sort((a, b) => a.defense - b.defense || a.name.localeCompare(b.name));
  const slotCount = slots.length;
  const maskCount = 1 << slotCount;

  if (!selectedCommanders.length) return assignments;

  let scores = new Float64Array(maskCount);
  let paths = Array(maskCount).fill(null);
  scores.fill(Number.NEGATIVE_INFINITY);
  scores[0] = 0;

  for (const commander of selectedCommanders) {
    const nextScores = new Float64Array(maskCount);
    const nextPaths = Array(maskCount).fill(null);
    nextScores.fill(Number.NEGATIVE_INFINITY);

    for (let mask = 0; mask < maskCount; mask += 1) {
      if (!Number.isFinite(scores[mask])) continue;

      slots.forEach((slot, slotIndex) => {
        const bit = 1 << slotIndex;
        if (mask & bit) return;
        if (!commanderFitsSlot(commander, slot, minimumDef)) return;

        const slotDef = toNumber(slot.def);
        const newMask = mask | bit;
        const placementScore = slotDef * 1000000000
          - commander.defense * slotDef * 1000000
          - toNumber(slot.index);
        const score = scores[mask] + placementScore;
        if (score > nextScores[newMask]) {
          nextScores[newMask] = score;
          nextPaths[newMask] = {
            previous: paths[mask],
            slotIndex,
            commander,
          };
        }
      });
    }

    scores = nextScores;
    paths = nextPaths;
  }

  let bestMask = -1;
  for (let mask = 0; mask < maskCount; mask += 1) {
    if (!Number.isFinite(scores[mask])) continue;
    if (bestMask === -1 || scores[mask] > scores[bestMask]) bestMask = mask;
  }
  if (bestMask === -1) return assignments;

  const arrangedAssignments = Array(slotCount).fill(null);
  let pathNode = paths[bestMask];
  while (pathNode) {
    arrangedAssignments[pathNode.slotIndex] = pathNode.commander;
    pathNode = pathNode.previous;
  }
  return arrangedAssignments;
}

function optimizeAdditiveFormation(formation, priority, minimumDef, commanders, weightFn, requiredIds = new Set()) {
  const slots = [...(formation.expandedCmdrSlots || [])].sort((a, b) => toNumber(a.index) - toNumber(b.index));
  const slotCount = slots.length;
  const maskCount = 1 << slotCount;
  const dp = new Float64Array(maskCount);
  const pathByMask = Array(maskCount).fill(null);
  const requiredIdSet = new Set(requiredIds);
  const requiredCommanders = commanders.filter((commander) => requiredIdSet.has(commander.id));
  const optionalCommanders = commanders.filter((commander) => !requiredIdSet.has(commander.id));
  const seeds = requiredPlacementSeeds(slots, requiredCommanders, minimumDef, weightFn);

  if (requiredIdSet.size && requiredCommanders.length !== requiredIdSet.size) return null;
  if (!seeds.length) return null;

  dp.fill(Number.NEGATIVE_INFINITY);
  for (const seed of seeds) {
    if (seed.score > dp[seed.mask]) {
      dp[seed.mask] = seed.score;
      pathByMask[seed.mask] = seed.path;
    }
  }

  const eligibleSlotsByCommander = optionalCommanders.map((commander) => {
    if (priority === "bonusres" && commander.bonusres <= 0) return [];

    const slotIndexes = [];
    slots.forEach((slot, slotIndex) => {
      if (commanderFitsSlot(commander, slot, minimumDef)) slotIndexes.push(slotIndex);
    });
    return slotIndexes;
  });

  optionalCommanders.forEach((commander, commanderIndex) => {
    const eligibleSlots = eligibleSlotsByCommander[commanderIndex];
    if (!eligibleSlots.length) return;
    const weight = weightFn(commander);

    for (let mask = maskCount - 1; mask >= 0; mask -= 1) {
      if (!Number.isFinite(dp[mask])) continue;
      for (const slotIndex of eligibleSlots) {
        const bit = 1 << slotIndex;
        if (mask & bit) continue;

        const newMask = mask | bit;
        const score = dp[mask] + weight;
        if (score > dp[newMask]) {
          dp[newMask] = score;
          pathByMask[newMask] = {
            previous: pathByMask[mask],
            slotIndex,
            commander,
          };
        }
      }
    }
  });

  let bestMask = 0;
  for (let mask = 1; mask < maskCount; mask += 1) {
    if (dp[mask] > dp[bestMask]) bestMask = mask;
  }

  const assignments = Array(slotCount).fill(null);
  let pathNode = pathByMask[bestMask];
  while (pathNode) {
    assignments[pathNode.slotIndex] = pathNode.commander;
    pathNode = pathNode.previous;
  }

  const arrangedAssignments = arrangeAssignmentsByDefense(slots, assignments, minimumDef);
  return buildResult(formation, slots, arrangedAssignments, priority);
}

function optimizeDamageFormation(formation, minimumDef) {
  const baseFormationBonus = formationBaseBonus(formation) + state.passiveFormationBonus;
  const estimatedAttack = estimateFormationAttack(formation, minimumDef);
  const estimatedPowerBase = COMMANDER_ATTACK_MULTIPLIER * estimatedAttack + inputFormationPowerBase();
  const formationBonusPointValue = estimatedPowerBase / 100;
  const effectRules = formationEffectRules(formation.effects);

  return optimizeAdditiveFormation(
    formation,
    "dmgscore",
    minimumDef,
    state.commanders,
    (commander) => {
      const estimatedScore = calculateDamageScore(commander, baseFormationBonus)
        + commander.formationBonus * formationBonusPointValue;
      const formationEffectContribution = commanderFormationEffectContribution(commander, effectRules);
      return (estimatedScore + formationEffectContribution) * SCORE_SCALE + commander.bonusres;
    },
    new Set(activeAlwaysUseIds()),
  );
}

function optimizeFormation(formation, priority, minimumDef) {
  if (priority === "dmgscore") return optimizeDamageFormation(formation, minimumDef);

  const formationBonusPercent = formationBaseBonus(formation) + state.passiveFormationBonus;
  return optimizeAdditiveFormation(
    formation,
    priority,
    minimumDef,
    state.commanders,
    (commander) => encodedWeight(commander, priority, formationBonusPercent),
  );
}

function compareResults(a, b, priority) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const aPrimary = priority === "bonusres" ? a.totalBonusres : a.totalDmgscore;
  const bPrimary = priority === "bonusres" ? b.totalBonusres : b.totalDmgscore;
  if (aPrimary !== bPrimary) return aPrimary - bPrimary;

  const aTie = priority === "bonusres" ? a.totalDmgscore : a.totalBonusres;
  const bTie = priority === "bonusres" ? b.totalDmgscore : b.totalBonusres;
  if (aTie !== bTie) return aTie - bTie;
  if (a.totalFormationBonus !== b.totalFormationBonus) {
    return a.totalFormationBonus - b.totalFormationBonus;
  }
  if (a.protect !== b.protect) return a.protect - b.protect;
  if (a.filledSlots !== b.filledSlots) return a.filledSlots - b.filledSlots;
  return b.formation.name.localeCompare(a.formation.name);
}

function selectedPriority() {
  return els.priority.value;
}

function selectedMinimumDef() {
  const value = Number(els.minimumDef.value);
  return Number.isFinite(value) ? value : 0;
}

function rerankSelectedFormation() {
  const formation = state.formations[els.formationSelect.value];
  if (!formation) {
    state.selectedResult = null;
    renderSelectedResult();
    return;
  }
  state.preferredFormationId = formation.id;
  state.selectedResult = optimizeFormation(formation, selectedPriority(), selectedMinimumDef());
  renderSelectedResult();
}

function rankedFormationResults(priority, minimumDef) {
  return visibleOwnedFormations()
    .map((formation) => optimizeFormation(formation, priority, minimumDef))
    .filter(Boolean)
    .sort((a, b) => compareResults(b, a, priority));
}

function selectFormationResult(result) {
  if (!result) {
    state.selectedResult = null;
    renderSelectedResult();
    return;
  }

  els.formationSelect.value = result.formation.id;
  state.preferredFormationId = result.formation.id;
  state.selectedResult = result;
  renderSelectedResult();
  saveInputValues();
}

function findBestFormation() {
  const priority = selectedPriority();
  const minimumDef = selectedMinimumDef();
  selectFormationResult(rankedFormationResults(priority, minimumDef)[0] || null);
}

function selectNextBestFormation() {
  const priority = selectedPriority();
  const minimumDef = selectedMinimumDef();
  const rankedResults = rankedFormationResults(priority, minimumDef);
  if (!rankedResults.length) {
    selectFormationResult(null);
    return;
  }

  const currentFormationId = state.selectedResult?.formation.id || els.formationSelect.value;
  const currentIndex = rankedResults.findIndex((result) => result.formation.id === currentFormationId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % rankedResults.length;
  selectFormationResult(rankedResults[nextIndex]);
}

function renderMetric(result, scoreEl, metaEl, nameEl) {
  if (!result) {
    scoreEl.textContent = "0";
    metaEl.textContent = "Not run";
    nameEl.textContent = "";
    els.protectValue.textContent = "0";
    els.protectMeta.textContent = "base 0 / passive 0 / active 0";
    els.formationPower.textContent = "0";
    els.formationPowerMeta.textContent = "base 0";
    els.effectAvg.textContent = "0";
    els.effectAvgMeta.textContent = "commanders 0 / formation 0";
    return;
  }

  scoreEl.textContent = formatDmgscore(result.totalDmgscore);
  metaEl.textContent = `${result.filledSlots}/${result.slots.length} slots / ${formatStat(result.totalBonusres)} bonusres`;
  nameEl.textContent = result.formation.name;
  els.protectValue.textContent = formatStat(result.protect);
  els.protectMeta.textContent = `base ${formatStat(result.baseProtect)} / passive ${formatStat(result.passiveFormationProtect)} / active ${formatStat(result.activeFormationProtect)}`;
  els.formationPower.textContent = formatStat(result.formationPower);
  els.formationPowerMeta.textContent = `base ${formatStat(result.formationPowerBase)} (${formatStat(result.commanderFormationPowerBase)} cmd + ${formatStat(result.inputPowerBase)} input) at ${formatPercent(result.totalFormationBonus)}`;
  els.effectAvg.textContent = formatStat(result.totalEffectAvg);
  els.effectAvgMeta.textContent = `commanders ${formatStat(result.commanderEffectAvg)} / formation ${formatStat(result.formationEffectAvg)}`;
}

function commanderCardScore(result, slotIndex, commander, priority) {
  if (priority === "bonusres") return commander.bonusres;

  const assignmentsWithoutCommander = result.assignments.slice();
  assignmentsWithoutCommander[slotIndex] = null;
  const resultWithoutCommander = buildResult(
    result.formation,
    result.slots,
    assignmentsWithoutCommander,
    priority,
  );
  return result.totalDmgscore - resultWithoutCommander.totalDmgscore;
}

function renderSlots(result, container) {
  container.innerHTML = "";
  if (!result) {
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = "No result";
    container.append(status);
    return;
  }

  const priority = selectedPriority();
  const scoreLabel = priority === "bonusres" ? "bonusres" : "dmgscore";
  const rows = new Map();

  result.slots.forEach((slot, slotIndex) => {
    const rowDef = toNumber(slot.def);
    if (!rows.has(rowDef)) rows.set(rowDef, []);
    rows.get(rowDef).push({ slot, slotIndex, commander: result.assignments[slotIndex] });
  });

  [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .forEach(([rowDef, entries]) => {
      const row = document.createElement("section");
      row.className = "formation-row";

      const label = document.createElement("div");
      label.className = "formation-row-label";
      label.innerHTML = `<span>DEF</span><strong>${formatStat(rowDef)}</strong>`;

      const grid = document.createElement("div");
      grid.className = "formation-card-grid";
      grid.style.gridTemplateColumns = `repeat(${entries.length}, minmax(0, 1fr))`;

      entries
        .sort((a, b) => toNumber(a.slot.index) - toNumber(b.slot.index))
        .forEach(({ slot, slotIndex, commander }) => {
          const card = document.createElement("article");
          card.className = `commander-card${commander ? "" : " empty"}`;

          const reqText = slotRequirements(slot);
          const scoreText = commander
            ? `${priority === "dmgscore"
              ? formatDmgscore(commanderCardScore(result, slotIndex, commander, priority))
              : formatStat(commanderCardScore(result, slotIndex, commander, priority))} ${scoreLabel}`
            : reqText;
          const formationBonusStat = commander?.formationBonus
            ? `<span><b>${formatSignedPercent(commander.formationBonus)}</b> form</span>`
            : "";
          const formationProtectStat = commander?.formationProtect
            ? `<span><b>+${formatStat(commander.formationProtect)}</b> prot</span>`
            : "";

          card.innerHTML = commander
            ? `
              <div class="card-topline">
                <span>#${slotIndex + 1}</span>
                <strong>${scoreText}</strong>
              </div>
              <h2>${commander.name}</h2>
              <div class="card-tags">
                <span>${commander.race}</span>
                <span>${commander.role}</span>
                <span>${commander.trait}</span>
              </div>
              <div class="card-stats">
                <span><b>${formatStat(commander.att)}</b> atk</span>
                <span><b>${formatStat(commander.defense)}</b> def</span>
                <span><b>${formatStat(commander.health)}</b> hp</span>
                <span><b>${formatStat(commander.effectavg)}</b> avg</span>
                ${formationBonusStat}
                ${formationProtectStat}
              </div>
              <div class="card-req">${reqText}</div>
            `
            : `
              <div class="card-topline">
                <span>#${slotIndex + 1}</span>
                <strong>empty</strong>
              </div>
              <h2>Open Slot</h2>
              <div class="card-req">${reqText}</div>
            `;

          grid.append(card);
        });

      row.append(label, grid);
      container.append(row);
    });
}

function renderSelectedResult() {
  renderMetric(state.selectedResult, els.selectedScore, els.selectedMeta, els.selectedName);
  renderSlots(state.selectedResult, els.selectedSlots);
}

function renderPassives() {
  const passiveRows = [
    ...state.passiveFormationBonuses.map((passive) => ({
      itemName: passive.itemName,
      amount: passive.amount,
      value: formatSignedPercent(passive.amount),
      sortValue: passive.amount,
    })),
    ...state.passiveFormationProtectBonuses.map((passive) => ({
      itemName: passive.itemName,
      amount: passive.amount,
      value: `+${formatStat(passive.amount)} prot`,
      sortValue: passive.amount * 100,
    })),
  ].sort((a, b) => b.sortValue - a.sortValue || a.itemName.localeCompare(b.itemName));

  els.passiveMeta.textContent = `${formatPercent(state.passiveFormationBonus)} form / ${formatStat(state.passiveFormationProtect)} prot / ${passiveRows.length} sources`;
  els.passiveList.innerHTML = "";

  if (!passiveRows.length) {
    const status = document.createElement("div");
    status.className = "status";
    status.textContent = "No passive formation bonuses found";
    els.passiveList.append(status);
    return;
  }

  for (const passive of passiveRows) {
    const row = document.createElement("div");
    row.className = "passive-item";
    row.innerHTML = `
      <span>${passive.itemName}</span>
      <strong>${passive.value}</strong>
    `;
    els.passiveList.append(row);
  }
}

function renderRoster() {
  const priority = selectedPriority();
  const commanders = [...state.commanders].sort((a, b) => {
    const primary = priority === "bonusres"
      ? b.bonusres - a.bonusres
      : b.formationBonus - a.formationBonus || b.att - a.att || b.effectavg - a.effectavg;
    if (primary) return primary;
    return b.bonusres - a.bonusres || a.name.localeCompare(b.name);
  });

  els.rosterRows.innerHTML = "";
  for (const commander of commanders) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${commander.name}</td>
      <td>${commander.race}</td>
      <td>${commander.role}</td>
      <td>${commander.trait}</td>
      <td class="numeric">${formatStat(commander.att)}</td>
      <td class="numeric">${formatStat(commander.defense)}</td>
      <td class="numeric">${formatStat(commander.effectavg)}</td>
      <td class="numeric">${formatStat(commander.bonusres)}</td>
      <td class="numeric">${commander.formationBonus ? formatSignedPercent(commander.formationBonus) : ""}</td>
      <td class="numeric">${commander.formationProtect ? `+${formatStat(commander.formationProtect)}` : ""}</td>
    `;
    els.rosterRows.append(row);
  }
  els.rosterMeta.textContent = `${commanders.length} commanders / ${state.ownedFormations.length} formations`;
}

function populateFormationSelect(preferredId = "") {
  const formations = visibleOwnedFormations();
  els.formationSelect.innerHTML = "";
  for (const formation of formations) {
    const option = document.createElement("option");
    option.value = formation.id;
    option.textContent = formation.name;
    els.formationSelect.append(option);
  }
  if (preferredId && formations.some((formation) => formation.id === preferredId)) {
    els.formationSelect.value = preferredId;
  } else if (formations.length) {
    els.formationSelect.value = formations[0].id;
  } else {
    els.formationSelect.value = "";
  }
  state.preferredFormationId = els.formationSelect.value;
}

function initializeData() {
  state.passiveFormationBonuses = buildPassiveFormationBonuses();
  if (state.bonusFormationBonus) {
    state.passiveFormationBonuses.push({
      itemId: "input.bonus-fb",
      itemName: "Input Bonus FB",
      amount: state.bonusFormationBonus,
    });
  }
  state.passiveFormationBonus = state.passiveFormationBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
  state.passiveFormationProtectBonuses = buildPassiveFormationProtectBonuses();
  if (state.bonusFormationProtect) {
    state.passiveFormationProtectBonuses.push({
      itemId: "input.bonus-prot",
      itemName: "Input Bonus Prot",
      amount: state.bonusFormationProtect,
    });
  }
  state.passiveFormationProtect = state.passiveFormationProtectBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);

  state.commanders = Object.entries(state.items)
    .filter(([itemId, item]) => (
      state.inventoryIds.has(itemId)
      && inventoryQuantity(itemId) > 0
      && isCommander(itemId, item)
    ))
    .map(([, item]) => buildCommander(item));
  const ownedCommanderIds = new Set(state.commanders.map((commander) => commander.id));
  state.alwaysUseCommanderIds = state.alwaysUseCommanderIds.filter((commanderId) => (
    ownedCommanderIds.has(commanderId)
  ));

  state.ownedFormations = Object.values(state.formations)
    .filter((formation) => state.inventoryIds.has(formation.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  populateFormationSelect(state.preferredFormationId);
}

function renderAll() {
  renderAlwaysUseControls();
  populateFormationSelect(state.preferredFormationId);
  renderDataSourceMeta();
  renderPassives();
  renderRoster();
  rerankSelectedFormation();
}

function bindEvents() {
  els.inputsTab.addEventListener("click", () => switchTab("inputs"));
  els.optimizerTab.addEventListener("click", () => switchTab("optimizer"));
  els.itemsFileInput.addEventListener("change", () => {
    loadDataFile("items", els.itemsFileInput.files?.[0]);
  });
  els.formationsFileInput.addEventListener("change", () => {
    loadDataFile("formations", els.formationsFileInput.files?.[0]);
  });

  [
    els.inventoryInput,
    els.bonusFpInput,
    els.bonusFbInput,
    els.bonusProtInput,
    els.leadershipInput,
  ].forEach((input) => {
    input.addEventListener("input", () => {
      updateInputDerivedMetrics();
      saveInputValues();
    });
  });

  [
    els.bonusFpInput,
    els.bonusFbInput,
    els.bonusProtInput,
    els.leadershipInput,
  ].forEach((input) => {
    input.addEventListener("change", () => applyInputValues());
  });

  els.applyInputs.addEventListener("click", () => applyInputValues());
  els.addAlwaysUse.addEventListener("click", addAlwaysUseCommander);
  els.alwaysUseList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-always-use]");
    if (!removeButton) return;
    removeAlwaysUseCommander(removeButton.dataset.removeAlwaysUse);
  });

  els.priority.addEventListener("change", () => {
    saveInputValues();
    renderAll();
  });
  els.formationSelect.addEventListener("change", () => {
    state.preferredFormationId = els.formationSelect.value;
    saveInputValues();
    rerankSelectedFormation();
  });
  els.minimumDef.addEventListener("input", () => {
    saveInputValues();
    renderAll();
  });
  els.findBest.addEventListener("click", findBestFormation);
  els.nextBest.addEventListener("click", selectNextBestFormation);
}

async function boot() {
  try {
    const [items, formations, inventory] = await Promise.all([
      loadJsonFrom(DATA_PATHS.items),
      loadJsonFrom(DATA_PATHS.formations),
      loadOptionalJson(DATA_PATHS.inventory, []),
    ]);

    state.items = items;
    state.formations = formations;
    renderDataSourceMeta();
    initializeInputFields(inventory);
    bindEvents();
    const applied = applyInputValues({ save: false });
    switchTab(applied ? state.activeTab : "inputs");
  } catch (error) {
    els.selectedSlots.innerHTML = `<div class="status">${error.message}</div>`;
  }
}

boot();
