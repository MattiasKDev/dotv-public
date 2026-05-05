const DATA_PATHS = {
  items: "../data/items.json",
  formations: "../data/formations.json",
};

const INPUT_STORAGE_KEY = "commander-formation-ranker-inputs-v1";
const COMMANDER_ATTACK_MULTIPLIER = 2.2;
const ROLE_TECH_TYPES = {
  "z.melee-mastermind": "melee",
  "z.brawns-commander": "tank",
  "z.distance-employer": "ranged",
  "z.scholarly-advice": "caster",
  "z.medical-management": "healer",
  "z.supportive-supervisor": "support",
};
const ROLE_TECH_ORDER = ["melee", "tank", "ranged", "caster", "healer", "support"];
const ROLE_TECH_LABELS = {
  melee: "Melee",
  tank: "Tank",
  ranged: "Ranged",
  caster: "Caster",
  healer: "Healer",
  support: "Support",
};
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
const ACTIVE_COMMANDER_STAT_BONUS_PATTERN = /Adds\s+(.+?)\s+to\s+(.+?)(?:\s+Commanders?)?\s+in\s+the\s+active\s+Formation\b/ig;
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
const MAX_EXACT_COMMANDER_SLOTS = 20;

function emptyRoleTechLevels() {
  return ROLE_TECH_ORDER.reduce((levels, role) => {
    levels[role] = 0;
    return levels;
  }, {});
}

const state = {
  items: {},
  formations: {},
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
  neverUseCommanderIds: [],
  commanders: [],
  ownedFormations: [],
  roleTechLevels: emptyRoleTechLevels(),
  passiveFormationBonus: 0,
  passiveFormationBonuses: [],
  passiveFormationProtect: 0,
  passiveFormationProtectBonuses: [],
  selectedResult: null,
  rankedResults: null,
  rankedSignature: "",
  rosterSort: {
    key: "",
    direction: "desc",
  },
};

const els = {
  inputsTab: document.getElementById("inputsTab"),
  optimizerTab: document.getElementById("optimizerTab"),
  inputsPanel: document.getElementById("inputsPanel"),
  optimizerPanel: document.getElementById("optimizerPanel"),
  inventoryInput: document.getElementById("inventoryInput"),
  pasteInventory: document.getElementById("pasteInventory"),
  copyInventoryScript: document.getElementById("copyInventoryScript"),
  inventoryScriptCode: document.getElementById("inventoryScriptCode"),
  bonusFpInput: document.getElementById("bonusFpInput"),
  bonusFbInput: document.getElementById("bonusFbInput"),
  bonusProtInput: document.getElementById("bonusProtInput"),
  leadershipInput: document.getElementById("leadershipInput"),
  alwaysUseSelect: document.getElementById("alwaysUseSelect"),
  addAlwaysUse: document.getElementById("addAlwaysUse"),
  alwaysUseList: document.getElementById("alwaysUseList"),
  neverUseSelect: document.getElementById("neverUseSelect"),
  addNeverUse: document.getElementById("addNeverUse"),
  neverUseList: document.getElementById("neverUseList"),
  leadershipFp: document.getElementById("leadershipFp"),
  totalBaseFp: document.getElementById("totalBaseFp"),
  applyInputs: document.getElementById("applyInputs"),
  inputStatus: document.getElementById("inputStatus"),
  priority: document.getElementById("priority"),
  formationSelect: document.getElementById("formationSelect"),
  minimumDefField: document.getElementById("minimumDefField"),
  minimumDef: document.getElementById("minimumDef"),
  findBest: document.getElementById("findBest"),
  rankMeta: document.getElementById("rankMeta"),
  prevBest: document.getElementById("prevBest"),
  nextBest: document.getElementById("nextBest"),
  protectValue: document.getElementById("protectValue"),
  protectMeta: document.getElementById("protectMeta"),
  formationPower: document.getElementById("formationPower"),
  formationPowerMeta: document.getElementById("formationPowerMeta"),
  effectAvg: document.getElementById("effectAvg"),
  effectAvgMeta: document.getElementById("effectAvgMeta"),
  selectedScore: document.getElementById("selectedScore"),
  selectedScoreLabel: document.getElementById("selectedScoreLabel"),
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
    // Storage can be unavailable in some browser modes; the current page session still works.
  }
}

async function pasteInventoryFromClipboard() {
  if (!navigator.clipboard?.readText) {
    setInputStatus("Clipboard paste is not available in this browser. Use Ctrl+V in the inventory box instead.", true);
    return;
  }

  try {
    const clipboardText = (await navigator.clipboard.readText()).trim();
    const inventoryData = JSON.parse(clipboardText);
    parseInventoryData(inventoryData);
    els.inventoryInput.value = formatInventoryText(inventoryData);
    applyInputValues();
  } catch (error) {
    setInputStatus(`Clipboard does not look like inventory JSON: ${error.message}`, true);
  }
}

async function copyInventoryScriptToClipboard() {
  if (!navigator.clipboard?.writeText) {
    setInputStatus("Clipboard copy is not available in this browser. Select the command and copy it manually.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(els.inventoryScriptCode.textContent);
    setInputStatus("Console command copied", false);
  } catch (error) {
    setInputStatus(`Could not copy command: ${error.message}`, true);
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

function roleTechLevelFormationPower(level) {
  return level > 1 ? level * 4 : 0;
}

function roleTechFormationPower(role) {
  return roleTechLevelFormationPower(state.roleTechLevels[role] || 0);
}

function normalizedRoleTechRole(role) {
  const normalized = String(role || "").toLowerCase();
  return ROLE_TECH_ORDER.includes(normalized) ? normalized : "";
}

function filledSlotTechRole(commander, slot = null) {
  return normalizedRoleTechRole(slot?.role) || normalizedRoleTechRole(commander?.role);
}

function slotTechFormationPower(commander, slot = null) {
  const role = filledSlotTechRole(commander, slot);
  return role ? roleTechFormationPower(role) : 0;
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
    neverUseCommanderIds: state.neverUseCommanderIds,
    rosterSort: state.rosterSort,
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

function initializeInputFields() {
  const stored = readStoredInputs();
  state.defaultInventoryText = "";
  state.preferredFormationId = String(stored.formationId ?? "");
  state.activeTab = stored.activeTab === "optimizer" && String(stored.inventoryText ?? "").trim()
    ? "optimizer"
    : "inputs";

  els.inventoryInput.value = typeof stored.inventoryText === "string" ? stored.inventoryText : "";
  els.bonusFpInput.value = stored.bonusFp ?? "2700";
  els.bonusFbInput.value = stored.bonusFb ?? "0";
  els.bonusProtInput.value = stored.bonusProt ?? "0";
  els.leadershipInput.value = stored.leadership ?? "0";
  els.priority.value = stored.priority === "bonusres" ? "bonusres" : "dmgscore";
  els.minimumDef.value = stored.minimumDef ?? "0";
  state.alwaysUseCommanderIds = Array.isArray(stored.alwaysUseCommanderIds)
    ? stored.alwaysUseCommanderIds.map(String)
    : [];
  state.neverUseCommanderIds = Array.isArray(stored.neverUseCommanderIds)
    ? stored.neverUseCommanderIds.map(String)
    : [];
  if (stored.rosterSort && ["att", "defense", "effectavg", "bonusres"].includes(stored.rosterSort.key)) {
    state.rosterSort = {
      key: stored.rosterSort.key,
      direction: stored.rosterSort.direction === "asc" ? "asc" : "desc",
    };
  }
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
  return state.alwaysUseCommanderIds;
}

function activeNeverUseIds() {
  return state.neverUseCommanderIds;
}

function optimizerCommanders() {
  const neverUseIds = new Set(activeNeverUseIds());
  return state.commanders.filter((commander) => !neverUseIds.has(commander.id));
}

function activeAlwaysUseCommanders() {
  const ids = new Set(activeAlwaysUseIds());
  return optimizerCommanders().filter((commander) => ids.has(commander.id));
}

function addAlwaysUseCommander() {
  const commanderId = els.alwaysUseSelect.value;
  if (!commanderId || state.alwaysUseCommanderIds.includes(commanderId)) return;

  state.alwaysUseCommanderIds.push(commanderId);
  state.neverUseCommanderIds = state.neverUseCommanderIds.filter((id) => id !== commanderId);
  renderAll();
  saveInputValues();
}

function removeAlwaysUseCommander(commanderId) {
  state.alwaysUseCommanderIds = state.alwaysUseCommanderIds.filter((id) => id !== commanderId);
  renderAll();
  saveInputValues();
}

function addNeverUseCommander() {
  const commanderId = els.neverUseSelect.value;
  if (!commanderId || state.neverUseCommanderIds.includes(commanderId)) return;

  state.neverUseCommanderIds.push(commanderId);
  state.alwaysUseCommanderIds = state.alwaysUseCommanderIds.filter((id) => id !== commanderId);
  renderAll();
  saveInputValues();
}

function removeNeverUseCommander(commanderId) {
  state.neverUseCommanderIds = state.neverUseCommanderIds.filter((id) => id !== commanderId);
  renderAll();
  saveInputValues();
}

function renderCommanderPickerControls({
  selectedIds,
  blockedIds,
  selectEl,
  addEl,
  listEl,
  removeAttribute,
}) {
  const selectedIdSet = new Set(selectedIds);
  const blockedIdSet = new Set(blockedIds);
  const availableCommanders = state.commanders
    .filter((commander) => !selectedIdSet.has(commander.id) && !blockedIdSet.has(commander.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  selectEl.innerHTML = "";
  if (availableCommanders.length) {
    for (const commander of availableCommanders) {
      const option = document.createElement("option");
      option.value = commander.id;
      option.textContent = commander.name;
      selectEl.append(option);
    }
    selectEl.disabled = false;
    addEl.disabled = false;
  } else {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = state.commanders.length ? "All owned commanders selected" : "No owned commanders";
    selectEl.append(option);
    selectEl.disabled = true;
    addEl.disabled = true;
  }

  listEl.innerHTML = "";
  const selectedCommanders = selectedIds
    .map((commanderId) => commanderById(commanderId))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!selectedCommanders.length) {
    const empty = document.createElement("div");
    empty.className = "status compact-status";
    empty.textContent = "None selected";
    listEl.append(empty);
    return;
  }

  for (const commander of selectedCommanders) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span>${commander.name}</span>
      <button type="button" ${removeAttribute}="${commander.id}" aria-label="Remove ${commander.name}">x</button>
    `;
    listEl.append(chip);
  }
}

function renderCommanderListControls() {
  renderCommanderPickerControls({
    selectedIds: state.alwaysUseCommanderIds,
    blockedIds: state.neverUseCommanderIds,
    selectEl: els.alwaysUseSelect,
    addEl: els.addAlwaysUse,
    listEl: els.alwaysUseList,
    removeAttribute: "data-remove-always-use",
  });
  renderCommanderPickerControls({
    selectedIds: state.neverUseCommanderIds,
    blockedIds: state.alwaysUseCommanderIds,
    selectEl: els.neverUseSelect,
    addEl: els.addNeverUse,
    listEl: els.neverUseList,
    removeAttribute: "data-remove-never-use",
  });
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
    const inventoryText = els.inventoryInput.value.trim();
    parsedInventory = parseInventoryData(inventoryText ? JSON.parse(inventoryText) : []);
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
  const rounded = Math.round(value * 10) / 10;
  const nearestInt = Math.round(rounded);
  if (Math.abs(rounded - nearestInt) < 0.000001) return String(nearestInt);
  return rounded.toFixed(1);
}

function formatDmgscore(value) {
  return formatStat(value);
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

function normalizeActiveStatBonusTarget(target) {
  return String(target ?? "")
    .replace(/^(?:each|every|all)\s+/i, "")
    .replace(/\s+Commanders?$/i, "")
    .trim();
}

function extractActiveCommanderStatBonuses(effects) {
  const bonuses = [];

  for (const rawSegment of String(effects ?? "").split(";")) {
    const segment = rawSegment.trim();
    if (!segment) continue;

    ACTIVE_COMMANDER_STAT_BONUS_PATTERN.lastIndex = 0;
    for (const match of segment.matchAll(ACTIVE_COMMANDER_STAT_BONUS_PATTERN)) {
      const amounts = { att: 0, defense: 0 };
      STAT_AMOUNT_PATTERN.lastIndex = 0;
      for (const statMatch of match[1].matchAll(STAT_AMOUNT_PATTERN)) {
        amounts[normalizeStatName(statMatch[2])] += parseNumber(statMatch[1]);
      }
      if (!amounts.att && !amounts.defense) continue;

      if (/\btroops?\b/i.test(match[2])) continue;

      bonuses.push({
        target: normalizeActiveStatBonusTarget(match[2]),
        att: amounts.att,
        defense: amounts.defense,
        label: segment,
      });
    }
  }

  return bonuses;
}

function commanderMatchesActiveStatTarget(commander, target) {
  const normalized = normalizeActiveStatBonusTarget(target);
  if (!normalized || /^(?:each|every|all)$/i.test(normalized)) return true;

  const targetPieces = splitFormationTargets(normalized);
  return targetPieces.some((targetPiece) => {
    const targetSlug = slugify(normalizeActiveStatBonusTarget(targetPiece));
    if (!targetSlug) return true;
    if (targetSlug === slugify(commander.name)) return true;

    return [commander.race, commander.role, commander.trait].some((value) => {
      if (!value) return false;
      return slugify(value) === targetSlug;
    });
  });
}

function activeStatAdjustmentsForCommander(commander, sourceCommanders) {
  return sourceCommanders.reduce((total, sourceCommander) => {
    for (const bonus of sourceCommander.activeStatBonuses) {
      if (!commanderMatchesActiveStatTarget(commander, bonus.target)) continue;
      total.att += bonus.att;
      total.defense += bonus.defense;
    }
    return total;
  }, { att: 0, defense: 0 });
}

function activeDefenseForCommander(commander, sourceCommanders) {
  return commander.defense + activeStatAdjustmentsForCommander(commander, sourceCommanders).defense;
}

function calculateDamageScore(commander, formationBonusPercent, slot = null) {
  const formationMultiplier = 1 + formationBonusPercent / 100;
  const powerBase = commanderFormationPowerBase(commander) + slotTechFormationPower(commander, slot);
  return powerBase * formationMultiplier + commander.effectavg;
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
  const activeStatBonuses = extractActiveCommanderStatBonuses(effects);
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
    activeStatBonuses,
    preReqs: Array.isArray(item.preReqs) ? item.preReqs : [],
    effectavg,
    effects,
  };
}

function buildOwnedRoleTechLevels() {
  const levels = emptyRoleTechLevels();

  for (const commander of state.commanders) {
    for (const req of commander.preReqs) {
      if (req?.name !== "tech") continue;

      const role = ROLE_TECH_TYPES[String(req.type ?? "")];
      if (!role) continue;

      levels[role] = Math.max(levels[role], toNumber(req.val));
    }
  }

  return levels;
}

function priorityValue(commander, priority, formationBonusPercent = 0, slot = null) {
  return priority === "bonusres" ? commander.bonusres : calculateDamageScore(commander, formationBonusPercent, slot);
}

function tiebreakValue(commander, priority, formationBonusPercent = 0, slot = null) {
  return priority === "bonusres" ? calculateDamageScore(commander, formationBonusPercent, slot) : commander.bonusres;
}

function encodedWeight(commander, priority, formationBonusPercent = 0, slot = null) {
  return priorityValue(commander, priority, formationBonusPercent, slot) * SCORE_SCALE
    + tiebreakValue(commander, priority, formationBonusPercent, slot);
}

function slotRequirements(slot) {
  const pieces = [];
  if (slot.race && slot.race !== "any") pieces.push(slot.race);
  if (slot.role && slot.role !== "any") pieces.push(slot.role);
  if (slot.trait && slot.trait !== "any") pieces.push(slot.trait);
  if (slot.unitID) pieces.push(slot.unitID);
  return pieces.join(" / ") || "any";
}

function commanderFitsSlotWithDefense(commander, slot, minimumDef, defense) {
  if (defense < minimumDef) return false;
  if (slot.unitID && commander.id !== slot.unitID) return false;
  if (slot.race && slot.race !== "any" && commander.race !== "any" && commander.race !== slot.race) return false;
  if (slot.role && slot.role !== "any" && commander.role !== "any" && commander.role !== slot.role) return false;
  if (slot.trait && slot.trait !== "any" && commander.trait !== "any" && commander.trait !== slot.trait) return false;
  return true;
}

function commanderFitsSlot(commander, slot, minimumDef, sourceCommanders = []) {
  const defense = minimumDef > 0
    ? activeDefenseForCommander(commander, sourceCommanders)
    : commander.defense;
  return commanderFitsSlotWithDefense(
    commander,
    slot,
    minimumDef,
    defense,
  );
}

function formationBaseBonus(formation) {
  return toNumber(formation?.bonus);
}

function formationProtect(formation) {
  return toNumber(formation?.protect);
}

function commanderSlotCount(formation) {
  return (formation?.expandedCmdrSlots || []).length;
}

function formationHasSupportedSlotCount(formation) {
  return commanderSlotCount(formation) <= MAX_EXACT_COMMANDER_SLOTS;
}

function buildResult(formation, slots, assignments, priority) {
  const selectedCommanders = assignments.filter(Boolean);
  const commanderStats = selectedCommanders.map((commander) => {
    const activeStatBonus = activeStatAdjustmentsForCommander(commander, selectedCommanders);
    return {
      commander,
      activeAttBonus: activeStatBonus.att,
      activeDefenseBonus: activeStatBonus.defense,
      att: commander.att + activeStatBonus.att,
      defense: commander.defense + activeStatBonus.defense,
    };
  });
  const commanderStatsById = new Map(
    commanderStats.map((commanderStat) => [commanderStat.commander.id, commanderStat]),
  );
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
  const commanderPowerBase = commanderStats.reduce(
    (sum, commanderStat) => sum + commanderStat.att * COMMANDER_ATTACK_MULTIPLIER,
    0,
  );
  const techPowerBase = assignments.reduce(
    (sum, commander, slotIndex) => (
      commander ? sum + slotTechFormationPower(commander, slots[slotIndex]) : sum
    ),
    0,
  );
  const inputPowerBase = inputFormationPowerBase();
  const formationPowerBase = commanderPowerBase + inputPowerBase + techPowerBase;
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
    commanderStatsById,
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
    techPowerBase,
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

function resultMeetsMinimumDef(result, minimumDef) {
  if (!result || minimumDef <= 0) return Boolean(result);
  return result.assignments.every((commander) => (
    !commander || (result.commanderStatsById.get(commander.id)?.defense ?? commander.defense) >= minimumDef
  ));
}

function estimateFormationPowerBase(formation, minimumDef) {
  const slots = [...(formation.expandedCmdrSlots || [])].sort((a, b) => toNumber(a.index) - toNumber(b.index));
  const eligibleCommanders = optimizerCommanders()
    .map((commander) => {
      const bestSlotPower = slots.reduce((best, slot) => {
        if (!commanderFitsSlot(commander, slot, minimumDef)) return best;
        return Math.max(best, slotTechFormationPower(commander, slot));
      }, Number.NEGATIVE_INFINITY);
      if (!Number.isFinite(bestSlotPower)) return null;

      return {
        commander,
        powerBase: commanderFormationPowerBase(commander) + bestSlotPower,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.powerBase - a.powerBase);

  const commanderAndTechPowerBase = eligibleCommanders
    .slice(0, slots.length)
    .reduce((sum, entry) => sum + entry.powerBase, 0);

  return commanderAndTechPowerBase + inputFormationPowerBase();
}

function requiredPlacementSeeds(slots, requiredCommanders, minimumDef, weightFn, sourceCommanders = requiredCommanders) {
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

    nextScores.fill(Number.NEGATIVE_INFINITY);
    for (let mask = 0; mask < maskCount; mask += 1) {
      if (!Number.isFinite(scores[mask])) continue;

      slots.forEach((slot, slotIndex) => {
        const bit = 1 << slotIndex;
        if (mask & bit) return;
        if (!commanderFitsSlot(commander, slot, minimumDef, sourceCommanders)) return;

        const newMask = mask | bit;
        const weight = weightFn(commander, slot, slotIndex);
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
  if (!formationHasSupportedSlotCount(formation)) return false;
  if (!requiredCommanders.length) return true;
  const slots = [...(formation.expandedCmdrSlots || [])].sort((a, b) => toNumber(a.index) - toNumber(b.index));
  return requiredPlacementSeeds(slots, requiredCommanders, minimumDef, () => 0, optimizerCommanders()).length > 0;
}

function visibleOwnedFormations() {
  const requiredCommanders = activeAlwaysUseCommanders();
  const minimumDef = selectedMinimumDef();
  if (!requiredCommanders.length) return state.ownedFormations;

  return state.ownedFormations.filter((formation) => (
    formationCanFitRequiredCommanders(formation, requiredCommanders, minimumDef)
  ));
}

function arrangeAssignmentsByDefense(
  slots,
  assignments,
  minimumDef,
  defenseFn = (commander) => commander.defense,
  scoreFn = () => 0,
) {
  const selectedCommanders = assignments
    .filter(Boolean)
    .sort((a, b) => defenseFn(a) - defenseFn(b) || a.name.localeCompare(b.name));
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
        const slotDef = toNumber(slot.def);
        const commanderDefense = defenseFn(commander);
        if (!commanderFitsSlotWithDefense(commander, slot, minimumDef, commanderDefense)) return;

        const newMask = mask | bit;
        const placementTieScore = slotDef * 1000000000
          - commanderDefense * slotDef * 1000000
          - toNumber(slot.index);
        const placementScore = scoreFn(commander, slot, slotIndex) + placementTieScore / 1000000000000;
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

function arrangeResultByActiveDefense(result, priority, minimumDef) {
  if (!result) return result;
  const arrangedAssignments = arrangeAssignmentsByDefense(
    result.slots,
    result.assignments,
    minimumDef,
    (commander) => result.commanderStatsById.get(commander.id)?.defense ?? commander.defense,
    (commander, slot) => slotTechFormationPower(commander, slot) * (1 + result.totalFormationBonus / 100),
  );
  return buildResult(result.formation, result.slots, arrangedAssignments, priority);
}

function optimizeAdditiveFormation(formation, priority, minimumDef, commanders, weightFn, requiredIds = new Set()) {
  const slots = [...(formation.expandedCmdrSlots || [])].sort((a, b) => toNumber(a.index) - toNumber(b.index));
  const slotCount = slots.length;
  if (slotCount > MAX_EXACT_COMMANDER_SLOTS) return null;
  const maskCount = 1 << slotCount;
  const dp = new Float64Array(maskCount);
  const pathByMask = Array(maskCount).fill(null);
  const requiredIdSet = new Set(requiredIds);
  const requiredCommanders = commanders.filter((commander) => requiredIdSet.has(commander.id));
  const optionalCommanders = commanders.filter((commander) => !requiredIdSet.has(commander.id));
  const seeds = requiredPlacementSeeds(slots, requiredCommanders, minimumDef, weightFn, commanders);

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

    const slotEntries = [];
    slots.forEach((slot, slotIndex) => {
      if (commanderFitsSlot(commander, slot, minimumDef, commanders)) {
        slotEntries.push({
          slotIndex,
          weight: weightFn(commander, slot, slotIndex),
        });
      }
    });
    return slotEntries;
  });

  optionalCommanders.forEach((commander, commanderIndex) => {
    const eligibleSlotEntries = eligibleSlotsByCommander[commanderIndex];
    if (!eligibleSlotEntries.length) return;

    for (let mask = maskCount - 1; mask >= 0; mask -= 1) {
      if (!Number.isFinite(dp[mask])) continue;
      for (const { slotIndex, weight } of eligibleSlotEntries) {
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

  const arrangedAssignments = arrangeAssignmentsByDefense(
    slots,
    assignments,
    0,
    (commander) => commander.defense,
    weightFn,
  );
  return arrangeResultByActiveDefense(
    buildResult(formation, slots, arrangedAssignments, priority),
    priority,
    minimumDef,
  );
}

function activeStatBonusCommanders(minimumDef = 0) {
  return optimizerCommanders().filter((commander) => (
    commander.activeStatBonuses.some((bonus) => bonus.att > 0 || (minimumDef > 0 && bonus.defense > 0))
  ));
}

function isBetterResult(candidate, current, priority, minimumDef = 0) {
  const candidateValid = resultMeetsMinimumDef(candidate, minimumDef);
  const currentValid = resultMeetsMinimumDef(current, minimumDef);
  if (candidateValid && !currentValid) return true;
  if (!candidateValid && currentValid) return false;
  return compareResults(candidate, current, priority) > 0.000001;
}

function defenseUnlockTargetsForSource(sourceCommander, candidates, minimumDef) {
  if (minimumDef <= 0) return [];
  return candidates.filter((commander) => {
    if (commander.id === sourceCommander.id) return false;
    if (commander.defense >= minimumDef) return false;
    return sourceCommander.activeStatBonuses.some((bonus) => (
      bonus.defense > 0
      && commanderMatchesActiveStatTarget(commander, bonus.target)
      && activeDefenseForCommander(commander, [sourceCommander]) >= minimumDef
    ));
  });
}

function buildDamageCandidate(baseResult, assignments, minimumDef, arrange = false) {
  const candidate = buildResult(baseResult.formation, baseResult.slots, assignments, "dmgscore");
  return arrange ? arrangeResultByActiveDefense(candidate, "dmgscore", minimumDef) : candidate;
}

function improveDamageResultWithActiveStatBonuses(result, minimumDef) {
  if (!result) return result;

  const auraCommanders = activeStatBonusCommanders(minimumDef);
  if (!auraCommanders.length) return result;

  const candidates = optimizerCommanders();
  const requiredIds = new Set(activeAlwaysUseIds());
  let bestResult = result;

  for (let pass = 0; pass < 4; pass += 1) {
    let improved = false;
    const usedIds = new Set(bestResult.assignments.filter(Boolean).map((commander) => commander.id));

    for (let slotIndex = 0; slotIndex < bestResult.slots.length; slotIndex += 1) {
      const existingCommander = bestResult.assignments[slotIndex];
      if (existingCommander && requiredIds.has(existingCommander.id)) continue;

      for (const auraCommander of auraCommanders) {
        if (usedIds.has(auraCommander.id)) continue;

        const candidateAssignments = bestResult.assignments.slice();
        candidateAssignments[slotIndex] = auraCommander;
        const candidateSourceSet = candidateAssignments.filter(Boolean);
        if (!commanderFitsSlot(auraCommander, bestResult.slots[slotIndex], minimumDef, candidateSourceSet)) continue;

        const candidateResult = buildDamageCandidate(bestResult, candidateAssignments, minimumDef);

        if (isBetterResult(candidateResult, bestResult, "dmgscore", minimumDef)) {
          bestResult = buildDamageCandidate(bestResult, candidateAssignments, minimumDef, true);
          improved = true;
          break;
        }
      }

      if (improved) break;
    }

    if (!improved) {
      const selectedSources = bestResult.assignments.filter(Boolean);
      const usedAfterSourcePass = new Set(selectedSources.map((commander) => commander.id));
      const unlockTargets = selectedSources
        .flatMap((sourceCommander) => defenseUnlockTargetsForSource(sourceCommander, candidates, minimumDef))
        .filter((commander, index, list) => (
          !usedAfterSourcePass.has(commander.id)
          && list.findIndex((item) => item.id === commander.id) === index
        ));

      for (let slotIndex = 0; slotIndex < bestResult.slots.length; slotIndex += 1) {
        const existingCommander = bestResult.assignments[slotIndex];
        if (existingCommander && requiredIds.has(existingCommander.id)) continue;

        for (const targetCommander of unlockTargets) {
          const candidateAssignments = bestResult.assignments.slice();
          candidateAssignments[slotIndex] = targetCommander;
          const candidateSourceSet = candidateAssignments.filter(Boolean);
          if (!commanderFitsSlot(targetCommander, bestResult.slots[slotIndex], minimumDef, candidateSourceSet)) continue;

          const candidateResult = buildDamageCandidate(bestResult, candidateAssignments, minimumDef);

          if (isBetterResult(candidateResult, bestResult, "dmgscore", minimumDef)) {
            bestResult = buildDamageCandidate(bestResult, candidateAssignments, minimumDef, true);
            improved = true;
            break;
          }
        }

        if (improved) break;
      }
    }

    if (!improved) {
      const usedAfterTargetPass = new Set(bestResult.assignments.filter(Boolean).map((commander) => commander.id));
      const replaceableSlots = bestResult.slots
        .map((slot, slotIndex) => ({ slot, slotIndex, commander: bestResult.assignments[slotIndex] }))
        .filter(({ commander }) => !commander || !requiredIds.has(commander.id));

      for (const sourceCommander of auraCommanders) {
        if (usedAfterTargetPass.has(sourceCommander.id)) continue;

        const unlockTargets = defenseUnlockTargetsForSource(sourceCommander, candidates, minimumDef)
          .filter((commander) => !usedAfterTargetPass.has(commander.id));

        for (const targetCommander of unlockTargets) {
          for (const sourceSlot of replaceableSlots) {
            for (const targetSlot of replaceableSlots) {
              if (sourceSlot.slotIndex === targetSlot.slotIndex) continue;

              const candidateAssignments = bestResult.assignments.slice();
              candidateAssignments[sourceSlot.slotIndex] = sourceCommander;
              candidateAssignments[targetSlot.slotIndex] = targetCommander;
              const sourceSet = candidateAssignments.filter(Boolean);
              if (!commanderFitsSlot(sourceCommander, sourceSlot.slot, minimumDef, sourceSet)) continue;
              if (!commanderFitsSlot(targetCommander, targetSlot.slot, minimumDef, sourceSet)) continue;

              const candidateResult = buildDamageCandidate(bestResult, candidateAssignments, minimumDef);

              if (isBetterResult(candidateResult, bestResult, "dmgscore", minimumDef)) {
                bestResult = buildDamageCandidate(bestResult, candidateAssignments, minimumDef, true);
                improved = true;
                break;
              }
            }
            if (improved) break;
          }
          if (improved) break;
        }
        if (improved) break;
      }
    }

    if (!improved) break;
  }

  return bestResult;
}

function optimizeDamageFormation(formation, minimumDef) {
  const baseFormationBonus = formationBaseBonus(formation) + state.passiveFormationBonus;
  const estimatedPowerBase = estimateFormationPowerBase(formation, minimumDef);
  const formationBonusPointValue = estimatedPowerBase / 100;
  const effectRules = formationEffectRules(formation.effects);

  const result = optimizeAdditiveFormation(
    formation,
    "dmgscore",
    minimumDef,
    optimizerCommanders(),
    (commander, slot) => {
      const estimatedScore = calculateDamageScore(commander, baseFormationBonus, slot)
        + commander.formationBonus * formationBonusPointValue;
      const formationEffectContribution = commanderFormationEffectContribution(commander, effectRules);
      return (estimatedScore + formationEffectContribution) * SCORE_SCALE + commander.bonusres;
    },
    new Set(activeAlwaysUseIds()),
  );
  const improvedResult = improveDamageResultWithActiveStatBonuses(result, minimumDef);
  return resultMeetsMinimumDef(improvedResult, minimumDef) ? improvedResult : null;
}

function optimizeFormation(formation, priority, minimumDef) {
  if (priority === "dmgscore") return optimizeDamageFormation(formation, minimumDef);

  const formationBonusPercent = formationBaseBonus(formation) + state.passiveFormationBonus;
  return optimizeAdditiveFormation(
    formation,
    priority,
    minimumDef,
    optimizerCommanders(),
    (commander, slot) => encodedWeight(commander, priority, formationBonusPercent, slot),
    new Set(activeAlwaysUseIds()),
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

function priorityLabel(priority) {
  return priority === "bonusres" ? "bonus res" : "dmg score";
}

function selectedScoreTitle(priority) {
  return priority === "bonusres" ? "Total Bonus Res" : "Total Dmg Score";
}

function selectedMinimumDef() {
  if (selectedPriority() !== "dmgscore") return 0;
  const value = Number(els.minimumDef.value);
  return Number.isFinite(value) ? value : 0;
}

function renderPriorityControls() {
  const isDamagePriority = selectedPriority() === "dmgscore";
  els.minimumDefField.hidden = !isDamagePriority;
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

function rankingSignature(priority, minimumDef) {
  return [
    priority,
    minimumDef,
    state.ownedFormations.map((formation) => formation.id).join(","),
    optimizerCommanders().map((commander) => commander.id).join(","),
    activeAlwaysUseIds().join(","),
    activeNeverUseIds().join(","),
    inputFormationPowerBase(),
    ROLE_TECH_ORDER.map((role) => state.roleTechLevels[role] || 0).join(","),
    state.passiveFormationBonus,
    state.passiveFormationProtect,
  ].join("|");
}

function invalidateRankedResults() {
  state.rankedResults = null;
  state.rankedSignature = "";
}

function computeRankedFormationResults(priority, minimumDef) {
  return visibleOwnedFormations()
    .map((formation) => optimizeFormation(formation, priority, minimumDef))
    .filter(Boolean)
    .sort((a, b) => compareResults(b, a, priority));
}

function cacheRankedFormationResults(priority, minimumDef) {
  state.rankedResults = computeRankedFormationResults(priority, minimumDef);
  state.rankedSignature = rankingSignature(priority, minimumDef);
  return state.rankedResults;
}

function currentRankedFormationResults() {
  const priority = selectedPriority();
  const minimumDef = selectedMinimumDef();
  if (state.rankedSignature !== rankingSignature(priority, minimumDef)) return null;
  return state.rankedResults;
}

function rankedFormationNavigation() {
  const rankedResults = currentRankedFormationResults();
  const currentFormationId = state.selectedResult?.formation.id || els.formationSelect.value;

  if (!rankedResults) {
    const formations = visibleOwnedFormations();
    return {
      rankedResults: null,
      currentIndex: formations.findIndex((formation) => formation.id === currentFormationId),
      total: formations.length,
    };
  }

  const currentIndex = rankedResults.findIndex((result) => result.formation.id === currentFormationId);
  return { rankedResults, currentIndex, total: rankedResults.length };
}

function updateRankButtons() {
  const { rankedResults, currentIndex, total } = rankedFormationNavigation();
  const hasRankedResults = Array.isArray(rankedResults);
  els.prevBest.disabled = !hasRankedResults || currentIndex <= 0;
  els.nextBest.disabled = !hasRankedResults || currentIndex === -1 || currentIndex >= rankedResults.length - 1;
  els.rankMeta.textContent = `Formation ${currentIndex === -1 ? 0 : currentIndex + 1}/${total}`;
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
  selectFormationResult(cacheRankedFormationResults(priority, minimumDef)[0] || null);
}

function selectAdjacentFormation(direction) {
  const rankedResults = currentRankedFormationResults();
  if (!rankedResults) return;
  const currentFormationId = state.selectedResult?.formation.id || els.formationSelect.value;
  const currentIndex = rankedResults.findIndex((result) => result.formation.id === currentFormationId);
  if (!rankedResults.length || currentIndex === -1) {
    selectFormationResult(null);
    return;
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= rankedResults.length) return;
  selectFormationResult(rankedResults[nextIndex]);
}

function renderMetric(result, scoreEl, metaEl, nameEl) {
  const priority = selectedPriority();
  els.selectedScoreLabel.textContent = selectedScoreTitle(priority);
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

  scoreEl.textContent = priority === "bonusres"
    ? formatStat(result.totalBonusres)
    : formatDmgscore(result.totalDmgscore);
  metaEl.textContent = `${result.filledSlots}/${result.slots.length} slots / ${formatStat(result.totalBonusres)} bonus res / ${formatDmgscore(result.totalDmgscore)} dmg score`;
  nameEl.textContent = result.formation.name;
  els.protectValue.textContent = formatStat(result.protect);
  els.protectMeta.textContent = `base ${formatStat(result.baseProtect)} / passive ${formatStat(result.passiveFormationProtect)} / active ${formatStat(result.activeFormationProtect)}`;
  els.formationPower.textContent = formatStat(result.formationPower);
  els.formationPowerMeta.textContent = `base ${formatStat(result.formationPowerBase)} (${formatStat(result.commanderFormationPowerBase)} cmd + ${formatStat(result.inputPowerBase)} input + ${formatStat(result.techPowerBase)} tech) at ${formatPercent(result.totalFormationBonus)}`;
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
  const scoreLabel = priorityLabel(priority);
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
          const commanderStat = commander ? result.commanderStatsById.get(commander.id) : null;
          const displayedAttack = commanderStat?.att ?? commander?.att ?? 0;
          const displayedDefense = commanderStat?.defense ?? commander?.defense ?? 0;
          const activeAttackNote = commanderStat?.activeAttBonus
            ? ` <small>+${formatStat(commanderStat.activeAttBonus)}</small>`
            : "";
          const activeDefenseNote = commanderStat?.activeDefenseBonus
            ? ` <small>+${formatStat(commanderStat.activeDefenseBonus)}</small>`
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
                <span><b>${formatStat(displayedAttack)}</b> atk${activeAttackNote}</span>
                <span><b>${formatStat(displayedDefense)}</b> def${activeDefenseNote}</span>
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
  updateRankButtons();
}

function renderPassives() {
  const formationPassiveRows = [
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
  const roleTechRows = ROLE_TECH_ORDER
    .map((role) => ({
      role,
      level: state.roleTechLevels[role] || 0,
      power: roleTechFormationPower(role),
    }))
    .filter((entry) => entry.power > 0)
    .map((entry) => ({
      itemName: `${ROLE_TECH_LABELS[entry.role]} tech`,
      value: `level ${formatStat(entry.level)} / +${formatStat(entry.power)} FP per slot`,
      sortValue: 0,
    }));
  const passiveRows = [...formationPassiveRows, ...roleTechRows]
    .sort((a, b) => b.sortValue - a.sortValue || a.itemName.localeCompare(b.itemName));

  els.passiveMeta.textContent = `${formatPercent(state.passiveFormationBonus)} form / ${formatStat(state.passiveFormationProtect)} prot / ${formationPassiveRows.length} sources / ${roleTechRows.length} tech`;
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

function defaultRosterCompare(a, b) {
  const priority = selectedPriority();
  const primary = priority === "bonusres"
    ? b.bonusres - a.bonusres
    : b.formationBonus - a.formationBonus || b.att - a.att || b.effectavg - a.effectavg;
  if (primary) return primary;
  return b.bonusres - a.bonusres || a.name.localeCompare(b.name);
}

function rosterSortValue(commander, key) {
  return toNumber(commander[key]);
}

function rosterCompare(a, b) {
  const { key, direction } = state.rosterSort;
  if (!key) return defaultRosterCompare(a, b);

  const delta = rosterSortValue(a, key) - rosterSortValue(b, key);
  if (delta) return direction === "asc" ? delta : -delta;
  return defaultRosterCompare(a, b);
}

function renderRosterSortControls() {
  document.querySelectorAll("[data-roster-sort]").forEach((button) => {
    const isActive = button.dataset.rosterSort === state.rosterSort.key;
    button.classList.toggle("active", isActive);
    button.dataset.direction = isActive ? state.rosterSort.direction : "";
    button.setAttribute("aria-sort", isActive ? (state.rosterSort.direction === "asc" ? "ascending" : "descending") : "none");
  });
}

function setRosterSort(key) {
  if (state.rosterSort.key === key) {
    state.rosterSort.direction = state.rosterSort.direction === "desc" ? "asc" : "desc";
  } else {
    state.rosterSort = { key, direction: "desc" };
  }
  renderRoster();
  saveInputValues();
}

function renderRoster() {
  const commanders = [...state.commanders].sort(rosterCompare);

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
  renderRosterSortControls();
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
  state.roleTechLevels = buildOwnedRoleTechLevels();
  const ownedCommanderIds = new Set(state.commanders.map((commander) => commander.id));
  state.alwaysUseCommanderIds = state.alwaysUseCommanderIds.filter((commanderId) => (
    ownedCommanderIds.has(commanderId)
  ));
  state.neverUseCommanderIds = state.neverUseCommanderIds.filter((commanderId) => (
    ownedCommanderIds.has(commanderId) && !state.alwaysUseCommanderIds.includes(commanderId)
  ));

  state.ownedFormations = Object.values(state.formations)
    .filter((formation) => (
      state.inventoryIds.has(formation.id)
      && inventoryQuantity(formation.id) > 0
      && formationHasSupportedSlotCount(formation)
    ))
    .sort((a, b) => a.name.localeCompare(b.name));

  populateFormationSelect(state.preferredFormationId);
}

function renderAll() {
  invalidateRankedResults();
  renderPriorityControls();
  renderCommanderListControls();
  populateFormationSelect(state.preferredFormationId);
  renderPassives();
  renderRoster();
  rerankSelectedFormation();
}

function bindEvents() {
  els.inputsTab.addEventListener("click", () => switchTab("inputs"));
  els.optimizerTab.addEventListener("click", () => switchTab("optimizer"));
  els.pasteInventory.addEventListener("click", pasteInventoryFromClipboard);
  els.copyInventoryScript.addEventListener("click", copyInventoryScriptToClipboard);

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
  els.addNeverUse.addEventListener("click", addNeverUseCommander);
  els.alwaysUseList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-always-use]");
    if (!removeButton) return;
    removeAlwaysUseCommander(removeButton.dataset.removeAlwaysUse);
  });
  els.neverUseList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-never-use]");
    if (!removeButton) return;
    removeNeverUseCommander(removeButton.dataset.removeNeverUse);
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
  document.querySelectorAll("[data-roster-sort]").forEach((button) => {
    button.addEventListener("click", () => setRosterSort(button.dataset.rosterSort));
  });
  els.findBest.addEventListener("click", findBestFormation);
  els.prevBest.addEventListener("click", () => selectAdjacentFormation(-1));
  els.nextBest.addEventListener("click", () => selectAdjacentFormation(1));
}

async function boot() {
  try {
    const [items, formations] = await Promise.all([
      loadJsonFrom(DATA_PATHS.items),
      loadJsonFrom(DATA_PATHS.formations),
    ]);

    state.items = items;
    state.formations = formations;
    initializeInputFields();
    bindEvents();
    const applied = applyInputValues({ save: false });
    switchTab(applied && state.inventoryIds.size ? state.activeTab : "inputs");
  } catch (error) {
    els.selectedSlots.innerHTML = `<div class="status">${error.message}</div>`;
  }
}

boot();
