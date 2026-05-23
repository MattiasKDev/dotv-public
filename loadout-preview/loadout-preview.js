(function () {
  "use strict";

  const DATA_PATHS = {
    items: "../data/items.json",
    itemLocations: "../data/item-locations.json",
  };
  const IMAGE_HOST = "https://files.dragonsofthevoid.com";
  const INVENTORY_STORAGE_KEY = "commander-formation-ranker-inputs-v1";
  const LOADOUT_STORAGE_KEY = "dotv-loadout-preview-v1";
  const UNKNOWN_LOCATION_TAG = "unknown";
  const MAX_OPTIMIZATION_SEEDS = 48;
  const MAX_TOP_TARGET_SLOT_ITEMS = 8;
  const LIMITED_TIME_TAG = "limited-time";
  const LIMITED_RAID_TAGS = new Set(["limited raids", "limited raid"]);

  const REAL_SLOT_KEYS = [
    "helm",
    "chest",
    "gloves",
    "pants",
    "boots",
    "main-hand",
    "off-hand",
    "ring",
    "mount",
  ];

  const EQUIP_SLOTS = [
    { key: "helm", label: "Helm", color: "#f0b35a" },
    { key: "neck", label: "Neck", color: "#8b949e", locked: true },
    { key: "chest", label: "Chest", color: "#ff9b72" },
    { key: "gloves", label: "Gloves", color: "#d2a8ff" },
    { key: "main-hand", label: "Main Hand", color: "#ff7b72" },
    { key: "off-hand", label: "Off Hand", color: "#a5d6ff" },
    { key: "pants", label: "Pants", color: "#79c0ff" },
    { key: "boots", label: "Boots", color: "#7ee787" },
    { key: "mount", label: "Mount", color: "#56d4bf" },
    { key: "ring", label: "Ring", color: "#dbb2ff" },
  ];

  const RESISTANCE_STATS = [
    "Acid Resistance",
    "Dark Resistance",
    "Fire Resistance",
    "Holy Resistance",
    "Ice Resistance",
    "Lightning Resistance",
    "Magic Resistance",
    "Nature Resistance",
    "Poison Resistance",
    "Psychic Resistance",
  ];

  const TOTAL_RESOURCE_TARGET = "Total Bonus Resources";
  const DAMAGE_REDUCTION_STAT = "Damage Reduction";
  const BLESSING_STATS = [
    { key: "Consecrated", label: "% Consecrated" },
    { key: "Sanctified", label: "% Sanctified" },
  ];
  const LEGACY_TARGET_ALIASES = {
    "Total Resistances": TOTAL_RESOURCE_TARGET,
    "Effective Damage Reduction": DAMAGE_REDUCTION_STAT,
  };

  const OPTIMIZER_TARGETS = [
    { key: "Crit Damage", label: "Crit Damage" },
    { key: "Crit Rate", label: "Crit Rate" },
    { key: "Evasion", label: "Evade" },
    { key: TOTAL_RESOURCE_TARGET, label: "Total Bonus Resources" },
    ...RESISTANCE_STATS.map((key) => ({ key, label: key })),
    { key: "Raid Cap", label: "Raid Cap" },
    { key: "Heal", label: "Average Healing" },
    { key: DAMAGE_REDUCTION_STAT, label: "Damage Reduction" },
  ];

  const PERCENT_STATS = new Set([
    "Acid Resistance",
    "All Resistances",
    "Crit Damage",
    "Crit Rate",
    "Dark Resistance",
    DAMAGE_REDUCTION_STAT,
    "Evasion",
    "Fire Resistance",
    "Formation Bonus",
    "Holy Resistance",
    "Ice Resistance",
    "Lightning Resistance",
    "Magic Resistance",
    "Nature Resistance",
    "Physical Resistance",
    "Poison Resistance",
    "Psychic Resistance",
    ...BLESSING_STATS.map((stat) => stat.key),
  ]);

  const HIDDEN_PASSIVE_STATS = new Set(["Attack", "Defense"]);

  const STAT_DISPLAY_ORDER = [
    "Attack",
    "Defense",
    "Magic",
    "HP",
    "Max HP",
    "Heal",
    TOTAL_RESOURCE_TARGET,
    "Energy",
    "Vitality",
    "Honor",
    "Offense",
    "Raid Cap",
    "Crit Rate",
    "Crit Damage",
    "Evasion",
    DAMAGE_REDUCTION_STAT,
    "Formation Bonus",
    "Formation Protection",
    ...BLESSING_STATS.map((stat) => stat.key),
    "All Resistances",
    ...RESISTANCE_STATS,
  ];

  const STAT_ALIAS_PAIRS = [
    ["Formation Protection", "Formation Protection Value"],
    ["Formation Protection", "Formation Protection"],
    ["All Resistances", "All Resistances"],
    ["All Resistances", "All Resistance"],
    ["Lightning Resistance", "Lightning Resistance"],
    ["Physical Resistance", "Physical Resistance"],
    ["Psychic Resistance", "Psychic Resistance"],
    ["Nature Resistance", "Nature Resistance"],
    ["Poison Resistance", "Poison Resistance"],
    ["Magic Resistance", "Magic Resistance"],
    ["Acid Resistance", "Acid Resistance"],
    ["Dark Resistance", "Dark Resistance"],
    ["Fire Resistance", "Fire Resistance"],
    ["Holy Resistance", "Holy Resistance"],
    ["Ice Resistance", "Ice Resistance"],
    ["Formation Bonus", "Formation Bonus"],
    ["Crit Damage", "Crit Damage"],
    ["Crit Rate", "Crit Rate"],
    ["Max HP", "Max HP"],
    ["Max HP", "HP"],
    ["Raid Cap", "Raid Cap"],
    ["Defense", "Defence"],
    ["Defense", "Defense"],
    ["Vitality", "Vitality"],
    ["Evasion", "Evasion"],
    ["Offense", "Offence"],
    ["Offense", "Offense"],
    ["Attack", "Attack"],
    ["Energy", "Energy"],
    ["Honor", "Honour"],
    ["Honor", "Honor"],
    ["Magic", "Magic"],
  ];

  const STAT_ALIAS_BY_TEXT = STAT_ALIAS_PAIRS.reduce((map, [key, alias]) => {
    map[alias.toLowerCase()] = key;
    return map;
  }, {});

  const WEAPON_FOCUS_META = {
    any: {
      label: "Any Weapon",
      types: null,
    },
    strength: {
      label: "Strength",
      types: new Set(["sword", "dagger", "impact", "polearm", "whip"]),
    },
    agility: {
      label: "Agility",
      types: new Set(["bow", "crossbow", "thrown", "darts"]),
    },
    intellect: {
      label: "Intellect",
      types: new Set(["staff", "wand", "rod", "orb"]),
    },
  };
  const SHIELD_TYPES = new Set(["buckler-shield", "medium-shield", "tower-shield"]);

  const STAT_ALIAS_PATTERN = new RegExp(
    `([+-])\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*%?\\s*(${
      [...new Set(STAT_ALIAS_PAIRS.map(([, alias]) => alias))]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join("|")
    })\\b(?!\\s+damage)`,
    "ig",
  );

  const DAMAGE_REDUCTION_PATTERN = /\breduc(?:e|es|ing)\s+incoming\s+damage\s+to\s+(?:the\s+)?player(?:\s+from\s+[^,;.]+?)?\s+by\s+(\d[\d,]*(?:\.\d+)?)\s*%/ig;

  const state = {
    items: [],
    itemsById: new Map(),
    setBonuses: new Map(),
    ownedItemIds: new Set(),
    loadout: {},
    selectedSlot: "helm",
    selectedId: "",
    pickerQuery: "",
    pickerScope: "all",
    optimizerTarget: "Crit Damage",
    optimizerScope: "all",
    weaponFocus: "any",
    detailTab: "info",
    includeLimitedTime: true,
    includeLimitedRaids: true,
    setOptionsCache: null,
    setOptionsSignature: "",
    setOptionsCacheBySignature: new Map(),
    optimizedLoadoutCache: new Map(),
  };

  const els = {
    optimizerTarget: document.getElementById("optimizerTarget"),
    optimizerScope: document.getElementById("optimizerScope"),
    weaponFocus: document.getElementById("weaponFocus"),
    includeLimitedTime: document.getElementById("includeLimitedTime"),
    includeLimitedRaids: document.getElementById("includeLimitedRaids"),
    clearLoadout: document.getElementById("clearLoadout"),
    optimizerStatus: document.getElementById("optimizerStatus"),
    loadoutMeta: document.getElementById("loadoutMeta"),
    setPicker: document.getElementById("setPicker"),
    slotGrid: document.getElementById("slotGrid"),
    pickerMeta: document.getElementById("pickerMeta"),
    itemSearch: document.getElementById("itemSearch"),
    pickerScope: document.getElementById("pickerScope"),
    candidateList: document.getElementById("candidateList"),
    summaryMeta: document.getElementById("summaryMeta"),
    passiveSummary: document.getElementById("passiveSummary"),
    procSummary: document.getElementById("procSummary"),
    detailPanel: document.getElementById("detailPanel"),
  };

  let optimizationPrewarmToken = 0;

  async function loadJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.json();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function parseNumber(value) {
    const number = Number(String(value).replaceAll(",", ""));
    return Number.isFinite(number) ? number : 0;
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0";
    return number.toLocaleString("en-US", {
      maximumFractionDigits: Number.isInteger(number) ? 0 : 2,
    });
  }

  function formatStatValue(key, value) {
    return `${formatNumber(value)}${PERCENT_STATS.has(key) ? "%" : ""}`;
  }

  function formatSignedStatValue(key, value) {
    const prefix = value > 0 ? "+" : "";
    return `${prefix}${formatStatValue(key, value)}`;
  }

  function optimizerTargetLabel(key) {
    return OPTIMIZER_TARGETS.find((target) => target.key === key)?.label || key;
  }

  function statDisplayLabel(key) {
    if (key === TOTAL_RESOURCE_TARGET) return optimizerTargetLabel(key);
    const blessing = BLESSING_STATS.find((stat) => stat.key === key);
    if (blessing) return blessing.label;
    return key;
  }

  function toTitleCase(value) {
    return String(value || "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function cleanIdLikeText(value) {
    return toTitleCase(String(value || "")
      .replace(/\b[a-z]{1,3}\.([a-z0-9-]+)\b/ig, "$1")
      .replace(/-/g, " "));
  }

  function formatLocationTag(tag) {
    return cleanIdLikeText(tag);
  }

  function normalizeSearchText(values) {
    return values.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function readStoredState() {
    if (typeof localStorage === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(LOADOUT_STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveStoredState() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify({
        loadout: state.loadout,
        selectedSlot: state.selectedSlot,
        pickerScope: state.pickerScope,
        optimizerScope: state.optimizerScope,
        weaponFocus: state.weaponFocus,
        optimizerTarget: state.optimizerTarget,
        detailTab: state.detailTab,
        includeLimitedTime: state.includeLimitedTime,
        includeLimitedRaids: state.includeLimitedRaids,
      }));
    } catch {
      // Storage can be unavailable in some browser modes; the current page session still works.
    }
  }

  function inventoryIdsFromData(data) {
    const ids = new Set();

    if (Array.isArray(data)) {
      data.forEach((entry) => {
        if (Array.isArray(entry)) {
          const itemId = String(entry[0] || "");
          if (itemId) ids.add(itemId);
        } else {
          const itemId = String(entry || "");
          if (itemId) ids.add(itemId);
        }
      });
      return ids;
    }

    if (data && typeof data === "object") {
      Object.keys(data).forEach((itemId) => ids.add(String(itemId)));
    }

    return ids;
  }

  function readOwnedItemIds() {
    if (typeof localStorage === "undefined") return new Set();
    try {
      const stored = JSON.parse(localStorage.getItem(INVENTORY_STORAGE_KEY) || "{}");
      const inventoryText = String(stored.inventoryText || "").trim();
      return inventoryText ? inventoryIdsFromData(JSON.parse(inventoryText)) : new Set();
    } catch {
      return new Set();
    }
  }

  function imageUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${IMAGE_HOST}${String(path).startsWith("/") ? "" : "/"}${path}`;
  }

  function initials(name) {
    return String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || "")
      .join("") || "?";
  }

  function createImage(item, className = "item-image") {
    const frame = document.createElement("div");
    frame.className = className;
    if (!item?.imageUrl) {
      frame.textContent = initials(item?.name);
      return frame;
    }

    const img = document.createElement("img");
    img.src = item.imageUrl;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      frame.innerHTML = "";
      frame.textContent = initials(item.name);
    }, { once: true });
    frame.append(img);
    return frame;
  }

  function stripSetBonusText(value) {
    return String(value || "")
      .split(/\r?\n/)
      .filter((line) => !/^\s*(?:set bonus|\d+\+?\s*(?::|\s+))/i.test(line))
      .join("\n");
  }

  function splitEffectSegments(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .split(/;|\n/)
      .map((segment) => segment.replace(/^\s*\d+\+?\s*:\s*/, "").trim())
      .filter(Boolean);
  }

  function passiveCandidateText(segment) {
    let text = String(segment || "").trim();
    if (!text) return "";

    text = text.replace(/^[^:+-]{1,80}:\s*/, "");

    const chanceIndex = text.search(/\b\d+(?:\.\d+)?%\s+chance\b/i);
    if (chanceIndex === 0) return "";
    if (chanceIndex > 0) text = text.slice(0, chanceIndex);

    if (/\b(?:on that|on this|on proc|on hit|for that|during this)\b/i.test(text)) return "";
    if (/\bdamage\b.*\b(?:per|vs)\b/i.test(text)) return "";
    if (/\bper\b/i.test(text)) return "";
    if (/\bvs\.?\s+\w+\s+raids?\b/i.test(text)) return "";
    if (
      /\bAdds?\b/i.test(text)
      && /\bto\b/i.test(text)
      && /\bFormation\b/i.test(text)
      && !/\bFormation Bonus\b|\bFormation Protection\b/i.test(text)
    ) {
      return "";
    }

    return text;
  }

  function addStat(stats, key, amount) {
    if (!amount) return;
    stats.set(key, (stats.get(key) || 0) + amount);
  }

  function parsePassiveStats(text) {
    const stats = new Map();

    splitEffectSegments(text).forEach((segment) => {
      const passiveText = passiveCandidateText(segment);
      if (!passiveText) return;

      STAT_ALIAS_PATTERN.lastIndex = 0;
      for (const match of passiveText.matchAll(STAT_ALIAS_PATTERN)) {
        const sign = match[1] === "-" ? -1 : 1;
        const amount = parseNumber(match[2]) * sign;
        const key = STAT_ALIAS_BY_TEXT[String(match[3]).toLowerCase()];
        addStat(stats, key, amount);
      }

      DAMAGE_REDUCTION_PATTERN.lastIndex = 0;
      for (const match of passiveText.matchAll(DAMAGE_REDUCTION_PATTERN)) {
        addStat(stats, DAMAGE_REDUCTION_STAT, parseNumber(match[1]));
      }
    });

    return stats;
  }

  function parseConditionalStatBoosts(text, source) {
    const boosts = [];
    const chancePattern = /(\d+(?:\.\d+)?)%\s+chance\b/ig;

    splitEffectSegments(text).forEach((segment) => {
      const chanceMatches = [...segment.matchAll(chancePattern)];
      if (!chanceMatches.length) return;

      chanceMatches.forEach((chanceMatch, index) => {
        const nextMatch = chanceMatches[index + 1];
        const body = segment.slice(chanceMatch.index, nextMatch ? nextMatch.index : undefined);
        if (!/\b(?:proc|with|give|giving|add|alongside)\b/i.test(body)) return;

        const chance = parseNumber(chanceMatch[1]) / 100;
        STAT_ALIAS_PATTERN.lastIndex = 0;
        for (const statMatch of body.matchAll(STAT_ALIAS_PATTERN)) {
          const sign = statMatch[1] === "-" ? -1 : 1;
          const amount = parseNumber(statMatch[2]) * sign;
          const key = STAT_ALIAS_BY_TEXT[String(statMatch[3]).toLowerCase()];
          if (isHealingHpStatMatch(body, statMatch)) continue;
          if (!key || !amount) continue;

          boosts.push({
            source,
            key,
            chance,
            amount,
            avg: amount * chance,
            text: body.trim(),
          });
        }
      });
    });

    return boosts;
  }

  function isHealingHpStatMatch(text, statMatch) {
    if (String(statMatch[3]).toLowerCase() !== "hp") return false;
    const before = String(text).slice(Math.max(0, statMatch.index - 64), statMatch.index);
    return /\b(?:heal|healing)\b/i.test(before);
  }

  function parseHealingBoosts(text, source) {
    const boosts = [];
    const chancePattern = /(\d+(?:\.\d+)?)%\s+chance\b/ig;
    const healPattern = /\b(?:heal|healing)\b\s+(?:the\s+)?player\s*\+?(\d[\d,]*(?:\.\d+)?)\s*HP\b/ig;

    splitEffectSegments(text).forEach((segment) => {
      const chanceMatches = [...segment.matchAll(chancePattern)];
      if (!chanceMatches.length) return;

      chanceMatches.forEach((chanceMatch, index) => {
        const nextMatch = chanceMatches[index + 1];
        const body = segment.slice(chanceMatch.index, nextMatch ? nextMatch.index : undefined);
        if (!/\b(?:heal|healing)\b/i.test(body)) return;

        const chance = parseNumber(chanceMatch[1]) / 100;
        healPattern.lastIndex = 0;
        for (const healMatch of body.matchAll(healPattern)) {
          const amount = parseNumber(healMatch[1]);
          if (!amount) continue;

          boosts.push({
            source,
            key: "Heal",
            chance,
            amount,
            avg: amount * chance,
            text: body.trim(),
          });
        }
      });
    });

    return boosts;
  }

  function parseDamageReductionBoosts(text, source) {
    const boosts = [];
    const chancePattern = /(\d+(?:\.\d+)?)%\s+chance\b/ig;

    splitEffectSegments(text).forEach((segment) => {
      const chanceMatches = [...segment.matchAll(chancePattern)];
      if (!chanceMatches.length) return;

      chanceMatches.forEach((chanceMatch, index) => {
        const nextMatch = chanceMatches[index + 1];
        const body = segment.slice(chanceMatch.index, nextMatch ? nextMatch.index : undefined);
        if (!/\breduc(?:e|es|ing)\s+incoming\s+damage\s+to\s+(?:the\s+)?player/i.test(body)) return;

        const chance = parseNumber(chanceMatch[1]) / 100;
        DAMAGE_REDUCTION_PATTERN.lastIndex = 0;
        for (const damageMatch of body.matchAll(DAMAGE_REDUCTION_PATTERN)) {
          const amount = parseNumber(damageMatch[1]);
          if (!amount) continue;

          boosts.push({
            source,
            key: DAMAGE_REDUCTION_STAT,
            chance,
            amount,
            avg: amount * chance,
            text: body.trim(),
          });
        }
      });
    });

    return boosts;
  }

  function parseConditionalEffects(text, source) {
    return [
      ...parseConditionalStatBoosts(text, source),
      ...parseHealingBoosts(text, source),
      ...parseDamageReductionBoosts(text, source),
    ];
  }

  function conditionalStatsFromBoosts(boosts, valueKey) {
    const stats = new Map();
    boosts.forEach((boost) => addStat(stats, boost.key, boost[valueKey]));
    return stats;
  }

  function procEntriesFromText(text, source) {
    const entries = [];
    let current = null;

    splitEffectSegments(text).forEach((segment) => {
      const clean = segment.replace(/^[^:+-]{1,80}:\s*/, "").trim();
      if (!clean) return;

      const startsProc = /\b\d+(?:\.\d+)?%\s+chance\b|\bproc\b/i.test(clean);
      const procModifier = /\bdamage\b.*\b(?:per|vs)\b|\bon that\b|\bon this\b|\bon proc\b|\bon hit\b/i.test(clean);

      if (startsProc) {
        if (current) entries.push(current);
        current = { source, text: clean };
        return;
      }

      if (current && procModifier) {
        current.text = `${current.text}; ${clean}`;
        return;
      }

      if (current) {
        entries.push(current);
        current = null;
      }
    });

    if (current) entries.push(current);
    return entries;
  }

  function procChancesFromText(text) {
    const chances = [];
    const chancePattern = /(\d+(?:\.\d+)?)%\s+chance\b/ig;

    splitEffectSegments(text).forEach((segment) => {
      const chanceMatches = [...segment.matchAll(chancePattern)];
      if (!chanceMatches.length) return;

      chanceMatches.forEach((chanceMatch, index) => {
        const nextMatch = chanceMatches[index + 1];
        const body = segment.slice(chanceMatch.index, nextMatch ? nextMatch.index : undefined);
        if (!/\bproc\b/i.test(body)) return;
        chances.push(Math.max(0, Math.min(1, parseNumber(chanceMatch[1]) / 100)));
      });
    });

    return chances;
  }

  function combinedIndependentChance(chances) {
    if (!chances.length) return 0;
    return 1 - chances.reduce((missChance, chance) => missChance * (1 - chance), 1);
  }

  function blessingChancesFromText(text) {
    const baseText = String(text || "");
    const procChance = combinedIndependentChance(procChancesFromText(baseText));
    const chances = new Map();
    if (!procChance) return chances;

    BLESSING_STATS.forEach(({ key }) => {
      const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");
      if (pattern.test(baseText)) chances.set(key, procChance * 100);
    });

    return chances;
  }

  function combinedIndependentPercentChance(chances) {
    return combinedIndependentChance(chances.map((chance) => Math.max(0, Math.min(100, chance)) / 100)) * 100;
  }

  function mergeStats(target, source) {
    for (const [key, value] of source.entries()) {
      addStat(target, key, value);
    }
  }

  function statsWithBase(item) {
    const stats = new Map(item.passiveStats);
    addStat(stats, "Attack", item.attack);
    addStat(stats, "Defense", item.defense);
    return stats;
  }

  function averageStats(baseStats, conditionalStats) {
    const stats = new Map(baseStats);
    mergeStats(stats, conditionalStats);
    return stats;
  }

  function setLabel(setId) {
    return cleanIdLikeText(String(setId || "").replace(/^is\./, ""));
  }

  function extractSetBonuses(rawItem) {
    const setIds = Array.isArray(rawItem.itemSetIds) ? rawItem.itemSetIds.map(String) : [];
    if (!setIds.length) return [];

    const lines = String(rawItem.effects || "").split(/\r?\n/);
    const bonuses = [];
    let currentSetName = "";
    let inSetBonus = false;

    lines.forEach((line) => {
      const header = line.match(/^\s*Set Bonus\s*\((.+?)\)/i);
      if (header) {
        currentSetName = header[1].trim();
        inSetBonus = true;
        return;
      }

      const threshold = line.match(/^\s*(\d+)\+?\s*:?\s+(.+)$/);
      if (inSetBonus && threshold) {
        bonuses.push({
          setIds,
          setName: currentSetName || setLabel(setIds[0]),
          threshold: parseNumber(threshold[1]),
          text: threshold[2].trim(),
        });
        return;
      }

      if (inSetBonus && line.trim() && !/^\s*\d+\+?\s*:/.test(line)) {
        inSetBonus = false;
      }
    });

    return bonuses;
  }

  function normalizeSetBonus(bonus) {
    const setName = bonus.setName || setLabel(bonus.setIds[0]);
    const source = `${setName} ${bonus.threshold}+`;
    const stats = parsePassiveStats(bonus.text);
    const conditionalBoosts = parseConditionalEffects(bonus.text, source);

    return {
      ...bonus,
      setName,
      stats,
      conditionalBoosts,
      conditionalStats: conditionalStatsFromBoosts(conditionalBoosts, "avg"),
      conditionalProcStats: conditionalStatsFromBoosts(conditionalBoosts, "amount"),
      procEntries: procEntriesFromText(bonus.text, source),
    };
  }

  function normalizeItem(rawItem, itemLocations) {
    const id = String(rawItem.id || "");
    const locationInfo = itemLocations[id] || null;
    const locationText = String(locationInfo?.locationText || "");
    const locationTags = Array.isArray(locationInfo?.tags)
      ? locationInfo.tags.map(String).filter((tag) => tag.trim() !== "")
      : [];
    if (!locationText.trim() && !locationTags.includes(UNKNOWN_LOCATION_TAG)) {
      locationTags.push(UNKNOWN_LOCATION_TAG);
    }
    const baseEffects = stripSetBonusText(rawItem.effects);
    const passiveStats = parsePassiveStats(baseEffects);
    const conditionalBoosts = parseConditionalEffects(baseEffects, String(rawItem.name || id || "Unknown"));
    const conditionalStats = conditionalStatsFromBoosts(conditionalBoosts, "avg");
    const conditionalProcStats = conditionalStatsFromBoosts(conditionalBoosts, "amount");
    const itemName = String(rawItem.name || id || "Unknown");
    const blessingChances = blessingChancesFromText(`${itemName}\n${baseEffects}`);
    const item = {
      raw: rawItem,
      id,
      name: itemName,
      slot: String(rawItem.equipSlot || ""),
      type: String(rawItem.equipType || ""),
      attack: toNumber(rawItem.attack),
      defense: toNumber(rawItem.defense),
      twoHanded: rawItem.twoHanded === true,
      imageUrl: imageUrl(rawItem.imagePath),
      obtainable: locationInfo?.obtainable === true,
      locationInfo,
      locationText,
      locationTags,
      itemSetIds: Array.isArray(rawItem.itemSetIds) ? rawItem.itemSetIds.map(String) : [],
      setBonuses: extractSetBonuses(rawItem).map(normalizeSetBonus),
      effects: String(rawItem.effects || ""),
      description: String(rawItem.description || ""),
      passiveStats,
      conditionalBoosts,
      conditionalStats,
      conditionalProcStats,
      blessingChances,
      procEntries: procEntriesFromText(baseEffects, itemName),
    };

    item.baseStats = statsWithBase(item);
    item.averageStats = averageStats(item.baseStats, conditionalStats);
    item.searchText = normalizeSearchText([
      item.id,
      item.name,
      item.slot,
      item.type,
      item.effects,
      item.description,
      item.locationText,
      item.locationTags.join(" "),
      item.itemSetIds.map(setLabel).join(" "),
    ]);
    return item;
  }

  function buildSetBonuses(items) {
    const map = new Map();

    items.forEach((item) => {
      item.setBonuses.forEach((bonus) => {
        bonus.setIds.forEach((setId) => {
          if (!map.has(setId)) {
            map.set(setId, {
              id: setId,
              name: bonus.setName || setLabel(setId),
              bonuses: [],
              seen: new Set(),
            });
          }

          const setInfo = map.get(setId);
          const key = `${bonus.threshold}:${bonus.text}`;
          if (setInfo.seen.has(key)) return;

          setInfo.seen.add(key);
          setInfo.bonuses.push({
            threshold: bonus.threshold,
            text: bonus.text,
            stats: bonus.stats,
            conditionalBoosts: bonus.conditionalBoosts,
          });
        });
      });
    });

    map.forEach((setInfo) => {
      setInfo.bonuses.sort((a, b) => a.threshold - b.threshold || a.text.localeCompare(b.text));
      delete setInfo.seen;
    });

    return map;
  }

  function setBonusesFromEquippedItems(items, setCounts) {
    const active = [];
    const seen = new Set();

    items.forEach((item) => {
      item.setBonuses.forEach((bonus) => {
        bonus.setIds.forEach((setId) => {
          if ((setCounts.get(setId) || 0) < bonus.threshold) return;

          const key = `${setId}:${bonus.threshold}:${bonus.text}`;
          if (seen.has(key)) return;
          seen.add(key);

          if (!bonus.stats.size && !bonus.conditionalBoosts.length && !bonus.procEntries.length) return;

          active.push({
            setId,
            setName: bonus.setName || setLabel(setId),
            threshold: bonus.threshold,
            text: bonus.text,
            stats: bonus.stats,
            conditionalBoosts: bonus.conditionalBoosts,
            conditionalStats: bonus.conditionalStats,
            conditionalProcStats: bonus.conditionalProcStats,
            procEntries: bonus.procEntries,
          });
        });
      });
    });

    return active.sort((a, b) => a.setName.localeCompare(b.setName) || a.threshold - b.threshold);
  }

  function buildItems(items, itemLocations) {
    return Object.values(items)
      .filter((item) => String(item.id || "").startsWith("e.") && item.equipSlot)
      .map((item) => normalizeItem(item, itemLocations))
      .filter((item) => item.obtainable)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  function compatibleWithSlot(item, slotKey) {
    if (!item || slotKey === "neck") return false;
    return item.slot === slotKey;
  }

  function isHandSlot(slotKey) {
    return slotKey === "main-hand" || slotKey === "off-hand";
  }

  function isShield(item) {
    return SHIELD_TYPES.has(item?.type);
  }

  function matchesWeaponFocus(item, focus = state.weaponFocus) {
    if (!item || focus === "any" || !isHandSlot(item.slot)) return true;
    if (isShield(item)) return true;

    const meta = WEAPON_FOCUS_META[focus] || WEAPON_FOCUS_META.any;
    return !meta.types || meta.types.has(item.type);
  }

  function weaponFocusLabel(focus = state.weaponFocus) {
    return WEAPON_FOCUS_META[focus]?.label || WEAPON_FOCUS_META.any.label;
  }

  function normalizeLocationTag(tag) {
    return String(tag || "").trim().toLowerCase();
  }

  function itemHasLocationTag(item, tag) {
    const normalized = normalizeLocationTag(tag);
    return Array.isArray(item?.locationTags)
      && item.locationTags.some((itemTag) => normalizeLocationTag(itemTag) === normalized);
  }

  function itemHasLimitedRaidTag(item) {
    return Array.isArray(item?.locationTags)
      && item.locationTags.some((tag) => LIMITED_RAID_TAGS.has(normalizeLocationTag(tag)));
  }

  function matchesLocationFilters(item) {
    if (!item) return true;
    if (!state.includeLimitedTime && itemHasLocationTag(item, LIMITED_TIME_TAG)) return false;
    if (!state.includeLimitedRaids && itemHasLimitedRaidTag(item)) return false;
    return true;
  }

  function enforceWeaponFocusOnLoadout() {
    let changed = false;
    const next = { ...state.loadout };

    ["main-hand", "off-hand"].forEach((slotKey) => {
      const item = itemById(next[slotKey]);
      if (!item || matchesWeaponFocus(item)) return;
      delete next[slotKey];
      changed = true;
    });

    state.loadout = next;
    if (changed && state.selectedId && !loadoutItemIds().includes(state.selectedId)) {
      state.selectedId = slotDisplayItem(state.selectedSlot)?.id || "";
    }
    return changed;
  }

  function enforceLocationFiltersOnLoadout() {
    let changed = false;
    const next = { ...state.loadout };

    REAL_SLOT_KEYS.forEach((slotKey) => {
      const item = itemById(next[slotKey]);
      if (!item || matchesLocationFilters(item)) return;
      delete next[slotKey];
      changed = true;
    });

    state.loadout = next;
    if (changed && state.selectedId && !loadoutItemIds().includes(state.selectedId)) {
      state.selectedId = slotDisplayItem(state.selectedSlot)?.id || "";
    }
    return changed;
  }

  function enforceItemFiltersOnLoadout() {
    const weaponChanged = enforceWeaponFocusOnLoadout();
    const locationChanged = enforceLocationFiltersOnLoadout();
    return weaponChanged || locationChanged;
  }

  function selectedSlotMeta() {
    return EQUIP_SLOTS.find((slot) => slot.key === state.selectedSlot) || EQUIP_SLOTS[0];
  }

  function itemById(itemId) {
    return state.itemsById.get(itemId) || null;
  }

  function mainHandItem(loadout = state.loadout) {
    return itemById(loadout["main-hand"]);
  }

  function slotDisplayItem(slotKey, loadout = state.loadout) {
    if (slotKey === "off-hand") {
      const main = mainHandItem(loadout);
      if (main?.twoHanded) return main;
    }
    return itemById(loadout[slotKey]);
  }

  function isSlotOccupiedByTwoHand(slotKey, loadout = state.loadout) {
    return slotKey === "off-hand" && mainHandItem(loadout)?.twoHanded === true;
  }

  function loadoutItemIds(loadout = state.loadout) {
    const ids = [];
    REAL_SLOT_KEYS.forEach((slotKey) => {
      if (slotKey === "off-hand" && isSlotOccupiedByTwoHand(slotKey, loadout)) return;
      const item = itemById(loadout[slotKey]);
      if (item && compatibleWithSlot(item, slotKey)) ids.push(item.id);
    });
    return [...new Set(ids)];
  }

  function equippedItems(loadout = state.loadout) {
    return loadoutItemIds(loadout).map(itemById).filter(Boolean);
  }

  function putItemInLoadout(loadout, slotKey, item) {
    const next = { ...loadout };

    if (!item) {
      if (slotKey === "off-hand" && mainHandItem(next)?.twoHanded) {
        delete next["main-hand"];
      } else {
        delete next[slotKey];
      }
      return next;
    }

    if (!compatibleWithSlot(item, slotKey)) return next;
    if (!matchesWeaponFocus(item)) return next;
    if (!matchesLocationFilters(item)) return next;

    if (slotKey === "off-hand" && mainHandItem(next)?.twoHanded) {
      delete next["main-hand"];
    }

    next[slotKey] = item.id;

    if (slotKey === "main-hand" && item.twoHanded) {
      delete next["off-hand"];
    }

    return next;
  }

  function selectSlot(slotKey) {
    const slot = EQUIP_SLOTS.find((entry) => entry.key === slotKey);
    if (!slot || slot.locked) return;

    state.selectedSlot = slotKey;
    const item = slotDisplayItem(slotKey);
    state.selectedId = item?.id || state.selectedId;
    saveStoredState();
    renderAll();
  }

  function equipItem(slotKey, item) {
    state.loadout = putItemInLoadout(state.loadout, slotKey, item);
    state.selectedSlot = slotKey;
    state.selectedId = item?.id || "";
    saveStoredState();
    renderAll();
  }

  function clearSlot(slotKey) {
    state.loadout = putItemInLoadout(state.loadout, slotKey, null);
    if (state.selectedSlot === slotKey) state.selectedId = "";
    saveStoredState();
    renderAll();
  }

  function buildSetCounts(items) {
    const counts = new Map();
    items.forEach((item) => {
      item.itemSetIds.forEach((setId) => {
        counts.set(setId, (counts.get(setId) || 0) + 1);
      });
    });
    return counts;
  }

  function activeSetBonusesForItems(items) {
    const counts = buildSetCounts(items);
    return setBonusesFromEquippedItems(items, counts);
  }

  function evaluateLoadout(loadout = state.loadout) {
    const items = equippedItems(loadout);
    const baseStats = new Map();
    const conditionalStats = new Map();
    const conditionalProcStats = new Map();
    const conditionalBoosts = [];
    const stats = new Map();
    const procs = [];
    const blessingChanceInputs = new Map(BLESSING_STATS.map(({ key }) => [key, []]));

    items.forEach((item) => {
      mergeStats(baseStats, item.baseStats);
      mergeStats(conditionalStats, item.conditionalStats);
      mergeStats(conditionalProcStats, item.conditionalProcStats);
      item.conditionalBoosts.forEach((boost) => conditionalBoosts.push(boost));
      item.procEntries.forEach((entry) => procs.push(entry));
      item.blessingChances.forEach((chance, key) => {
        if (blessingChanceInputs.has(key)) blessingChanceInputs.get(key).push(chance);
      });
    });

    const activeSetBonuses = activeSetBonusesForItems(items);
    activeSetBonuses.forEach((bonus) => {
      mergeStats(baseStats, bonus.stats);
      mergeStats(conditionalStats, bonus.conditionalStats);
      mergeStats(conditionalProcStats, bonus.conditionalProcStats);
      bonus.conditionalBoosts.forEach((boost) => conditionalBoosts.push(boost));
      bonus.procEntries.forEach((entry) => procs.push(entry));
    });

    mergeStats(stats, baseStats);
    mergeStats(stats, conditionalStats);
    const blessingStats = new Map();
    blessingChanceInputs.forEach((chances, key) => {
      const chance = combinedIndependentPercentChance(chances);
      if (chance) blessingStats.set(key, chance);
    });

    return {
      items,
      baseStats,
      conditionalStats,
      conditionalProcStats,
      conditionalBoosts,
      stats,
      blessingStats,
      procs,
      activeSetBonuses,
    };
  }

  function totalResourceValue(stats) {
    return (stats.get("Vitality") || 0)
      + (stats.get("Energy") || 0)
      + (stats.get("Honor") || 0);
  }

  function targetValueFromStats(stats, targetKey) {
    if (targetKey === TOTAL_RESOURCE_TARGET) {
      return totalResourceValue(stats);
    }

    const base = stats.get(targetKey) || 0;
    if (RESISTANCE_STATS.includes(targetKey)) {
      return base + (stats.get("All Resistances") || 0);
    }
    return base;
  }

  function effectiveDamageReductionValue(stats) {
    const evasion = (stats.get("Evasion") || 0) / 100;
    const playerReduction = (stats.get(DAMAGE_REDUCTION_STAT) || 0) / 100;
    return (1 - ((1 - evasion) * (1 - playerReduction))) * 100;
  }

  function itemTargetValue(item, targetKey) {
    return targetValueFromStats(item.averageStats, targetKey);
  }

  function itemMitigationValue(item) {
    return effectiveDamageReductionValue(item.averageStats);
  }

  function candidatePassiveEntries(item) {
    const entries = [];
    const seen = new Set(HIDDEN_PASSIVE_STATS);
    const target = state.optimizerTarget;
    const targetValue = !seen.has(target) ? itemTargetValue(item, target) : 0;

    if (targetValue) {
      entries.push([target, targetValue]);
      seen.add(target);
    }

    [...item.averageStats.entries()]
      .filter(([key, value]) => value && !seen.has(key))
      .sort((a, b) => statSortIndex(a[0]) - statSortIndex(b[0]) || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .forEach(([key, value]) => {
        entries.push([key, value]);
        seen.add(key);
      });

    return entries;
  }

  function setBonusStats(activeSetBonuses) {
    const stats = new Map();
    activeSetBonuses.forEach((bonus) => {
      mergeStats(stats, bonus.stats);
      mergeStats(stats, bonus.conditionalStats);
    });
    return stats;
  }

  function setContributionForRow(setStats, row) {
    if (row.target) return targetValueFromStats(setStats, row.key);
    return setStats.get(row.key) || 0;
  }

  function statValueForRow(stats, row) {
    return row.target ? targetValueFromStats(stats, row.key) : (stats.get(row.key) || 0);
  }

  function formatConditionalBreakdown(row, baseValue, procValue, avgValue) {
    return [
      `base ${formatStatValue(row.key, baseValue)}`,
      `with proc ${formatStatValue(row.key, procValue)}`,
      `avg ${formatStatValue(row.key, avgValue)}`,
    ].join(" / ");
  }

  function equippedCount(loadout) {
    return loadoutItemIds(loadout).length;
  }

  function loadoutScore(loadout, targetKey) {
    const result = evaluateLoadout(loadout);
    return {
      loadout,
      result,
      score: targetValueFromStats(result.stats, targetKey),
      mitigationScore: effectiveDamageReductionValue(result.stats),
      equippedCount: equippedCount(loadout),
    };
  }

  function compareScoredLoadouts(a, b) {
    return b.score - a.score
      || b.mitigationScore - a.mitigationScore
      || a.equippedCount - b.equippedCount;
  }

  function sourceItems(scope) {
    return state.items.filter((item) => (
      (scope !== "owned" || state.ownedItemIds.has(item.id))
      && matchesWeaponFocus(item)
      && matchesLocationFilters(item)
    ));
  }

  function itemsForSlot(items, slotKey) {
    return items.filter((item) => compatibleWithSlot(item, slotKey));
  }

  function setBonusTargetValue(bonus, targetKey) {
    const bonusStats = averageStats(
      bonus.stats,
      conditionalStatsFromBoosts(bonus.conditionalBoosts || [], "avg"),
    );
    return targetValueFromStats(bonusStats, targetKey);
  }

  function targetRelevantSetIds(targetKey) {
    const setIds = new Set();
    state.setBonuses.forEach((setInfo, setId) => {
      if (setInfo.bonuses.some((bonus) => setBonusTargetValue(bonus, targetKey) > 0)) {
        setIds.add(setId);
      }
    });
    return setIds;
  }

  function itemInSetIds(item, setIds) {
    return item.itemSetIds.some((setId) => setIds.has(setId));
  }

  function sortItemsForTarget(items, targetKey) {
    return [...items].sort((a, b) => (
      itemTargetValue(b, targetKey) - itemTargetValue(a, targetKey)
      || itemMitigationValue(b) - itemMitigationValue(a)
      || a.name.localeCompare(b.name)
    ));
  }

  function topDirectTargetItemsBySlot(items, targetKey) {
    const itemsBySlot = new Map();

    REAL_SLOT_KEYS.forEach((slotKey) => {
      const ranked = sortItemsForTarget(
        itemsForSlot(items, slotKey).filter((item) => itemTargetValue(item, targetKey) > 0),
        targetKey,
      );
      if (!ranked.length) return;

      if (isHandSlot(slotKey)) {
        itemsBySlot.set(slotKey, ranked.slice(0, MAX_TOP_TARGET_SLOT_ITEMS));
        return;
      }

      const topValue = itemTargetValue(ranked[0], targetKey);
      itemsBySlot.set(slotKey, ranked
        .filter((item) => Math.abs(itemTargetValue(item, targetKey) - topValue) < 0.000001)
        .slice(0, MAX_TOP_TARGET_SLOT_ITEMS));
    });

    return itemsBySlot;
  }

  function topDirectTargetItemIds(itemsBySlot) {
    const ids = new Set();
    itemsBySlot.forEach((items) => {
      items.forEach((item) => ids.add(item.id));
    });
    return ids;
  }

  function optimizationCandidateItems(
    items,
    targetKey,
    directItemsBySlot = topDirectTargetItemsBySlot(items, targetKey),
    relevantSetIds = targetRelevantSetIds(targetKey),
  ) {
    const topDirectIds = topDirectTargetItemIds(directItemsBySlot);

    return items.filter((item) => (
      topDirectIds.has(item.id)
      || itemInSetIds(item, relevantSetIds)
    ));
  }

  function createOptimizationContext(items, targetKey) {
    const relevantSetIds = targetRelevantSetIds(targetKey);
    const directItemsBySlot = topDirectTargetItemsBySlot(items, targetKey);
    const candidateItems = optimizationCandidateItems(items, targetKey, directItemsBySlot, relevantSetIds);
    const setSlotBestItems = new Map();

    relevantSetIds.forEach((setId) => {
      const slotItems = new Map();
      REAL_SLOT_KEYS.forEach((slotKey) => {
        const item = bestSetItemForSlot(candidateItems, setId, slotKey, targetKey);
        if (item) slotItems.set(slotKey, item);
      });
      if (slotItems.size) setSlotBestItems.set(setId, slotItems);
    });

    return {
      items: candidateItems,
      targetKey,
      relevantSetIds,
      directItemsBySlot,
      setSlotBestItems,
    };
  }

  function bestItem(candidates, targetKey, options = {}) {
    const best = candidates.reduce((currentBest, item) => {
      if (!currentBest) return item;
      const delta = itemTargetValue(item, targetKey) - itemTargetValue(currentBest, targetKey);
      const mitigationDelta = itemMitigationValue(item) - itemMitigationValue(currentBest);
      return delta > 0
        || (delta === 0 && mitigationDelta > 0)
        || (delta === 0 && mitigationDelta === 0 && item.name.localeCompare(currentBest.name) < 0)
        ? item
        : currentBest;
    }, null);
    if (!best) return null;
    if (!options.allowNonPositive && itemTargetValue(best, targetKey) <= 0) return null;
    return best;
  }

  function bestHandLoadout(loadout, mainCandidates, offCandidates, targetKey) {
    let best = loadoutScore(loadout, targetKey);
    const mains = [null, ...mainCandidates];
    const offs = [null, ...offCandidates];

    mains.forEach((mainItem) => {
      offs.forEach((offItem) => {
        let trial = { ...loadout };
        delete trial["main-hand"];
        delete trial["off-hand"];

        if (mainItem) {
          trial = putItemInLoadout(trial, "main-hand", mainItem);
        }
        if (offItem && !mainItem?.twoHanded) {
          trial = putItemInLoadout(trial, "off-hand", offItem);
        }

        const scored = loadoutScore(trial, targetKey);
        if (compareScoredLoadouts(scored, best) < 0) best = scored;
      });
    });

    return best.loadout;
  }

  function fillEmptySlotsWithTargetItems(loadout, items, targetKey) {
    let next = { ...loadout };

    REAL_SLOT_KEYS
      .filter((slotKey) => !["main-hand", "off-hand"].includes(slotKey))
      .forEach((slotKey) => {
        if (next[slotKey]) return;
        const item = bestItem(itemsForSlot(items, slotKey), targetKey);
        if (item) next = putItemInLoadout(next, slotKey, item);
      });

    const main = itemById(next["main-hand"]);
    const off = itemById(next["off-hand"]);
    if (!main && !off) {
      next = bestHandLoadout(
        next,
        itemsForSlot(items, "main-hand").filter((item) => itemTargetValue(item, targetKey) > 0),
        itemsForSlot(items, "off-hand").filter((item) => itemTargetValue(item, targetKey) > 0),
        targetKey,
      );
    } else if (main && !main.twoHanded && !off) {
      const item = bestItem(itemsForSlot(items, "off-hand"), targetKey);
      if (item) next = putItemInLoadout(next, "off-hand", item);
    } else if (!main && off) {
      const item = bestItem(
        itemsForSlot(items, "main-hand").filter((candidate) => !candidate.twoHanded),
        targetKey,
      );
      if (item) next = putItemInLoadout(next, "main-hand", item);
    }

    return next;
  }

  function bestSetItemForSlot(items, setId, slotKey, targetKey) {
    return bestItem(
      itemsForSlot(items, slotKey).filter((item) => item.itemSetIds.includes(setId)),
      targetKey,
      { allowNonPositive: true },
    );
  }

  function setCountInLoadout(loadout, setId) {
    return equippedItems(loadout)
      .filter((item) => item.itemSetIds.includes(setId))
      .length;
  }

  function setThresholdLoadouts(items, targetKey, setId, threshold) {
    const slotOptions = REAL_SLOT_KEYS
      .map((slotKey) => [slotKey, bestSetItemForSlot(items, setId, slotKey, targetKey)])
      .filter(([, item]) => item);
    const loadouts = [];
    const seen = new Set();
    const targetRank = ([, item]) => itemTargetValue(item, targetKey);
    const mitigationRank = ([, item]) => itemMitigationValue(item);
    const sortedByTarget = [...slotOptions].sort((a, b) => (
      targetRank(b) - targetRank(a)
      || mitigationRank(b) - mitigationRank(a)
      || a[1].name.localeCompare(b[1].name)
    ));
    const sortedByMitigation = [...slotOptions].sort((a, b) => (
      mitigationRank(b) - mitigationRank(a)
      || targetRank(b) - targetRank(a)
      || a[1].name.localeCompare(b[1].name)
    ));

    const addIndexes = (indexes) => {
      if (indexes.length < threshold) return;
      const key = indexes.slice().sort((a, b) => a - b).join(",");
      if (seen.has(key)) return;
      seen.add(key);

      let loadout = {};
      indexes.forEach((index) => {
        const [slotKey, item] = slotOptions[index];
        loadout = putItemInLoadout(loadout, slotKey, item);
      });
      if (setCountInLoadout(loadout, setId) < threshold) return;
      loadouts.push(fillEmptySlotsWithTargetItems(loadout, items, targetKey));
    };

    if (slotOptions.length <= 5 || threshold >= slotOptions.length - 1) {
      const maxMask = 1 << slotOptions.length;
      for (let mask = 1; mask < maxMask; mask += 1) {
        const indexes = [];
        slotOptions.forEach(([, item], index) => {
          if ((mask & (1 << index)) && item) indexes.push(index);
        });
        addIndexes(indexes);
      }
      return loadouts;
    }

    addIndexes(sortedByTarget.slice(0, threshold).map((entry) => slotOptions.indexOf(entry)));
    addIndexes(sortedByMitigation.slice(0, threshold).map((entry) => slotOptions.indexOf(entry)));

    slotOptions.forEach((entry, index) => {
      const indexes = [index];
      sortedByTarget.forEach((candidate) => {
        const candidateIndex = slotOptions.indexOf(candidate);
        if (indexes.length < threshold && !indexes.includes(candidateIndex)) indexes.push(candidateIndex);
      });
      addIndexes(indexes);
    });

    return loadouts;
  }

  function baselineLoadout(items, targetKey) {
    let loadout = {};

    REAL_SLOT_KEYS
      .filter((slotKey) => !["main-hand", "off-hand"].includes(slotKey))
      .forEach((slotKey) => {
        const item = bestItem(itemsForSlot(items, slotKey), targetKey);
        if (item) loadout = putItemInLoadout(loadout, slotKey, item);
      });

    return bestHandLoadout(
      loadout,
      itemsForSlot(items, "main-hand"),
      itemsForSlot(items, "off-hand"),
      targetKey,
    );
  }

  function setBiasedLoadout(items, targetKey, setId) {
    let loadout = {};

    REAL_SLOT_KEYS
      .filter((slotKey) => !["main-hand", "off-hand"].includes(slotKey))
      .forEach((slotKey) => {
        const setCandidates = itemsForSlot(items, slotKey)
          .filter((item) => item.itemSetIds.includes(setId));
        const item = setCandidates.length
          ? bestItem(setCandidates, targetKey, { allowNonPositive: true })
          : bestItem(itemsForSlot(items, slotKey), targetKey);
        if (item) loadout = putItemInLoadout(loadout, slotKey, item);
      });

    const setMains = itemsForSlot(items, "main-hand").filter((item) => item.itemSetIds.includes(setId));
    const setOffs = itemsForSlot(items, "off-hand").filter((item) => item.itemSetIds.includes(setId));

    return bestHandLoadout(
      loadout,
      setMains.length ? setMains : itemsForSlot(items, "main-hand"),
      setOffs.length ? setOffs : itemsForSlot(items, "off-hand"),
      targetKey,
    );
  }

  function bestSetHandLoadout(loadout, items, targetKey, setId) {
    let best = null;
    const mainCandidates = itemsForSlot(items, "main-hand")
      .filter((item) => item.itemSetIds.includes(setId));
    const offCandidates = itemsForSlot(items, "off-hand")
      .filter((item) => item.itemSetIds.includes(setId));

    mainCandidates.forEach((mainItem) => {
      if (mainItem.twoHanded) {
        const trial = putItemInLoadout(loadout, "main-hand", mainItem);
        const scored = loadoutScore(trial, targetKey);
        if (!best || compareScoredLoadouts(scored, best) < 0) best = scored;
        return;
      }

      offCandidates.forEach((offItem) => {
        let trial = putItemInLoadout(loadout, "main-hand", mainItem);
        trial = putItemInLoadout(trial, "off-hand", offItem);
        const scored = loadoutScore(trial, targetKey);
        if (!best || compareScoredLoadouts(scored, best) < 0) best = scored;
      });
    });

    return best?.loadout || null;
  }

  function fullSetLoadout(items, targetKey, setId) {
    let loadout = {};

    for (const slotKey of REAL_SLOT_KEYS.filter((slot) => !["main-hand", "off-hand"].includes(slot))) {
      const item = bestSetItemForSlot(items, setId, slotKey, targetKey);
      if (!item) return null;
      loadout = putItemInLoadout(loadout, slotKey, item);
    }

    return bestSetHandLoadout(loadout, items, targetKey, setId);
  }

  function fullLoadoutSetId(loadout = state.loadout) {
    const displayItems = REAL_SLOT_KEYS.map((slotKey) => slotDisplayItem(slotKey, loadout));
    if (displayItems.some((item) => !item)) return "";

    const sharedSetIds = new Set(displayItems[0].itemSetIds);
    displayItems.slice(1).forEach((item) => {
      [...sharedSetIds].forEach((setId) => {
        if (!item.itemSetIds.includes(setId)) sharedSetIds.delete(setId);
      });
    });

    return [...sharedSetIds]
      .sort((a, b) => setLabel(a).localeCompare(setLabel(b)))[0] || "";
  }

  function optimizerSignature(targetKey = state.optimizerTarget) {
    return [
      targetKey,
      state.optimizerScope,
      state.weaponFocus,
      state.includeLimitedTime,
      state.includeLimitedRaids,
      state.optimizerScope === "owned" ? [...state.ownedItemIds].sort().join(",") : "",
    ].join("|");
  }

  function setOptionsSignature(targetKey = state.optimizerTarget) {
    return optimizerSignature(targetKey);
  }

  function availableSetOptions(targetKey = state.optimizerTarget) {
    const signature = setOptionsSignature(targetKey);
    if (state.setOptionsCacheBySignature.has(signature)) {
      return state.setOptionsCacheBySignature.get(signature);
    }

    const items = sourceItems(state.optimizerScope);
    const setIds = new Set();
    items.forEach((item) => item.itemSetIds.forEach((setId) => setIds.add(setId)));

    const options = [...setIds]
      .map((setId) => {
        const loadout = fullSetLoadout(items, targetKey, setId);
        if (!loadout) return null;
        const score = loadoutScore(loadout, targetKey).score;
        return {
          id: setId,
          name: setLabel(setId),
          loadout,
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    state.setOptionsSignature = signature;
    state.setOptionsCache = options;
    state.setOptionsCacheBySignature.set(signature, options);
    return options;
  }

  function renderSetPicker() {
    const currentSetId = fullLoadoutSetId();
    const options = availableSetOptions();
    const hasCurrentSet = options.some((option) => option.id === currentSetId);

    els.setPicker.innerHTML = "";
    const custom = document.createElement("option");
    custom.value = "";
    custom.textContent = "Custom";
    els.setPicker.append(custom);

    if (currentSetId && !hasCurrentSet) {
      const current = document.createElement("option");
      current.value = currentSetId;
      current.textContent = `${setLabel(currentSetId)} (${formatSignedStatValue(state.optimizerTarget, loadoutScore(state.loadout, state.optimizerTarget).score)})`;
      els.setPicker.append(current);
    }

    options.forEach((option) => {
      const element = document.createElement("option");
      element.value = option.id;
      element.textContent = `${option.name} (${formatSignedStatValue(state.optimizerTarget, option.score)})`;
      els.setPicker.append(element);
    });

    els.setPicker.value = currentSetId || "";
  }

  function selectSetLoadout(setId) {
    if (!setId) {
      renderSetPicker();
      return;
    }

    const option = availableSetOptions().find((entry) => entry.id === setId);
    if (!option) {
      renderSetPicker();
      setStatus("That set cannot make a full loadout with the current filters.", true);
      return;
    }

    applyScoredLoadout(loadoutScore(option.loadout, state.optimizerTarget));
    setStatus(`Loaded ${option.name}: ${formatStatValue(state.optimizerTarget, option.score)} ${optimizerTargetLabel(state.optimizerTarget)}.`);
  }

  function uniqueItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function loadoutRelevantSetIds(loadout, relevantSetIds) {
    const setIds = new Set();
    equippedItems(loadout).forEach((item) => {
      item.itemSetIds.forEach((setId) => {
        if (relevantSetIds.has(setId)) setIds.add(setId);
      });
    });
    return setIds;
  }

  function improvementSlotCandidates(context, loadout, slotKey) {
    const candidates = [...(context.directItemsBySlot.get(slotKey) || [])];
    loadoutRelevantSetIds(loadout, context.relevantSetIds).forEach((setId) => {
      const item = context.setSlotBestItems.get(setId)?.get(slotKey);
      if (item) candidates.push(item);
    });
    return uniqueItems(candidates);
  }

  function improveLoadout(seedLoadout, context) {
    const { targetKey } = context;
    let best = loadoutScore(seedLoadout, targetKey);

    for (let pass = 0; pass < 3; pass += 1) {
      let improved = false;

      REAL_SLOT_KEYS
        .filter((slotKey) => !["main-hand", "off-hand"].includes(slotKey))
        .forEach((slotKey) => {
          [null, ...improvementSlotCandidates(context, best.loadout, slotKey)].forEach((item) => {
            const trial = putItemInLoadout(best.loadout, slotKey, item);
            const scored = loadoutScore(trial, targetKey);
            if (compareScoredLoadouts(scored, best) < 0) {
              best = scored;
              improved = true;
            }
          });
        });

      const handLoadout = bestHandLoadout(
        best.loadout,
        improvementSlotCandidates(context, best.loadout, "main-hand"),
        improvementSlotCandidates(context, best.loadout, "off-hand"),
        targetKey,
      );
      const handScore = loadoutScore(handLoadout, targetKey);
      if (compareScoredLoadouts(handScore, best) < 0) {
        best = handScore;
        improved = true;
      }

      if (!improved) break;
    }

    return best;
  }

  function uniqueLoadoutKey(loadout) {
    return REAL_SLOT_KEYS.map((slotKey) => loadout[slotKey] || "").join("|");
  }

  function optimizationSeedScores(context) {
    const { items, targetKey, relevantSetIds } = context;
    const seedMap = new Map();
    const addSeed = (loadout) => {
      seedMap.set(uniqueLoadoutKey(loadout), loadout);
    };

    addSeed(baselineLoadout(items, targetKey));

    state.setBonuses.forEach((setInfo, setId) => {
      if (!relevantSetIds.has(setId)) return;
      const setItems = items.filter((item) => item.itemSetIds.includes(setId));
      if (!setItems.length) return;

      addSeed(setBiasedLoadout(items, targetKey, setId));
      setInfo.bonuses.forEach((bonus) => {
        if (setBonusTargetValue(bonus, targetKey) === 0) return;
        setThresholdLoadouts(items, targetKey, setId, bonus.threshold).forEach(addSeed);
      });
    });

    return [...seedMap.values()]
      .map((loadout) => loadoutScore(loadout, targetKey))
      .sort(compareScoredLoadouts)
      .slice(0, MAX_OPTIMIZATION_SEEDS);
  }

  function applyScoredLoadout(scored) {
    state.loadout = scored.loadout;
    const firstEquipped = equippedItems(state.loadout)[0];
    state.selectedSlot = firstEquipped?.slot || "helm";
    state.selectedId = firstEquipped?.id || "";
    saveStoredState();
    renderAll();
  }

  function optimizedLoadoutForCurrentSettings(targetKey = state.optimizerTarget) {
    const signature = optimizerSignature(targetKey);
    if (state.optimizedLoadoutCache.has(signature)) {
      return state.optimizedLoadoutCache.get(signature);
    }

    const sourceItemPool = sourceItems(state.optimizerScope);
    if (!sourceItemPool.length) {
      const emptyResult = {
        scored: loadoutScore({}, targetKey),
        message: "No items available for the selected source.",
        isError: true,
      };
      state.optimizedLoadoutCache.set(signature, emptyResult);
      return emptyResult;
    }

    const context = createOptimizationContext(sourceItemPool, targetKey);
    if (!context.items.length) {
      const emptyResult = {
        scored: loadoutScore({}, targetKey),
        message: `No target-relevant items found for ${optimizerTargetLabel(targetKey)}; loadout left empty.`,
        isError: true,
      };
      state.optimizedLoadoutCache.set(signature, emptyResult);
      return emptyResult;
    }

    const topSeeds = optimizationSeedScores(context);
    if (!topSeeds.length) {
      const emptyResult = {
        scored: loadoutScore({}, targetKey),
        message: "No loadouts found for the selected optimizer settings.",
        isError: true,
      };
      state.optimizedLoadoutCache.set(signature, emptyResult);
      return emptyResult;
    }

    let best = topSeeds[0];
    topSeeds.forEach((seed) => {
      const improved = improveLoadout(seed.loadout, context);
      if (compareScoredLoadouts(improved, best) < 0) best = improved;
    });

    const result = {
      scored: best,
      message: `${optimizerTargetLabel(targetKey)}: ${formatStatValue(targetKey, best.score)} from ${state.optimizerScope === "owned" ? "owned" : "all"} ${weaponFocusLabel().toLowerCase()} items.`,
      isError: false,
    };
    state.optimizedLoadoutCache.set(signature, result);
    return result;
  }

  function deferOptimizationWork(callback) {
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(callback, { timeout: 500 });
      return;
    }
    setTimeout(callback, 50);
  }

  function scheduleOptimizationPrewarm() {
    const token = ++optimizationPrewarmToken;
    const pendingTargets = OPTIMIZER_TARGETS
      .map((target) => target.key)
      .filter((targetKey) => targetKey !== state.optimizerTarget)
      .filter((targetKey) => !state.optimizedLoadoutCache.has(optimizerSignature(targetKey)));

    const runNext = () => {
      if (token !== optimizationPrewarmToken || !pendingTargets.length) return;
      const targetKey = pendingTargets.shift();
      optimizedLoadoutForCurrentSettings(targetKey);
      availableSetOptions(targetKey);
      if (pendingTargets.length) deferOptimizationWork(runNext);
    };

    deferOptimizationWork(runNext);
  }

  function autoOptimizeLoadout() {
    optimizationPrewarmToken += 1;
    const result = optimizedLoadoutForCurrentSettings();
    applyScoredLoadout(result.scored);
    setStatus(result.message, result.isError);
    scheduleOptimizationPrewarm();
  }

  function setStatus(message, isError = false) {
    els.optimizerStatus.textContent = message;
    els.optimizerStatus.classList.toggle("is-error", isError);
  }

  function statSortIndex(key) {
    const index = STAT_DISPLAY_ORDER.indexOf(key);
    return index === -1 ? STAT_DISPLAY_ORDER.length : index;
  }

  function renderOptimizerTargets() {
    const keys = new Set(OPTIMIZER_TARGETS.map((target) => target.key));
    state.optimizerTarget = LEGACY_TARGET_ALIASES[state.optimizerTarget] || state.optimizerTarget;
    els.optimizerTarget.innerHTML = "";
    OPTIMIZER_TARGETS.forEach(({ key, label }) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      els.optimizerTarget.append(option);
    });

    if (!keys.has(state.optimizerTarget)) state.optimizerTarget = OPTIMIZER_TARGETS[0].key;
    els.optimizerTarget.value = state.optimizerTarget;
  }

  function renderSlots() {
    els.slotGrid.innerHTML = "";

    EQUIP_SLOTS.forEach((slot) => {
      const item = slot.locked ? null : slotDisplayItem(slot.key);
      const occupiedByTwoHand = isSlotOccupiedByTwoHand(slot.key);
      const card = document.createElement("article");
      card.className = [
        "slot-card",
        state.selectedSlot === slot.key ? "is-active" : "",
        slot.locked ? "is-locked" : "",
        occupiedByTwoHand ? "is-occupied" : "",
      ].filter(Boolean).join(" ");
      card.style.setProperty("--slot-color", slot.color);
      card.setAttribute("role", slot.locked ? "group" : "button");
      if (!slot.locked) card.tabIndex = 0;

      const art = item ? createImage(item, "slot-art") : document.createElement("div");
      if (!item) {
        art.className = "slot-art";
        art.textContent = initials(slot.label);
      }

      const copy = document.createElement("div");
      copy.className = "slot-copy";
      const slotLabel = document.createElement("span");
      slotLabel.className = "slot-label";
      slotLabel.textContent = slot.label;
      const name = document.createElement("strong");
      name.className = "slot-name";
      name.textContent = item ? item.name : "Empty";
      const meta = document.createElement("span");
      meta.className = "slot-meta";
      if (slot.locked) {
        meta.textContent = "No neck items";
      } else if (occupiedByTwoHand) {
        meta.textContent = "Occupied by two-handed weapon";
      } else if (item) {
        const type = document.createElement("span");
        type.textContent = cleanIdLikeText(item.type);
        meta.append(type);

        const targetValue = itemTargetValue(item, state.optimizerTarget);
        if (targetValue) {
          const target = document.createElement("span");
          target.className = "slot-target";
          target.textContent = `${formatSignedStatValue(state.optimizerTarget, targetValue)} ${optimizerTargetLabel(state.optimizerTarget)}`;
          meta.append(target);
        }
      } else {
        meta.textContent = "Open slot";
      }
      copy.append(slotLabel, name, meta);
      card.append(art, copy);

      if (item && !occupiedByTwoHand && !slot.locked) {
        const clearButton = document.createElement("button");
        clearButton.type = "button";
        clearButton.className = "slot-clear";
        clearButton.setAttribute("aria-label", `Clear ${slot.label}`);
        clearButton.textContent = "x";
        clearButton.addEventListener("click", (event) => {
          event.stopPropagation();
          clearSlot(slot.key);
        });
        card.append(clearButton);
      }

      if (!slot.locked) {
        card.addEventListener("click", () => {
          state.selectedId = item?.id || state.selectedId;
          selectSlot(slot.key);
        });
        card.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          state.selectedId = item?.id || state.selectedId;
          selectSlot(slot.key);
        });
      }

      els.slotGrid.append(card);
    });

    const count = equippedItems().length;
    els.loadoutMeta.textContent = `${formatNumber(count)} equipped`;
  }

  function candidateItems() {
    const slot = selectedSlotMeta();
    if (slot.locked) return [];

    const query = state.pickerQuery.toLowerCase().replace(/\s+/g, " ").trim();
    return sourceItems(state.pickerScope)
      .filter((item) => compatibleWithSlot(item, slot.key))
      .filter((item) => !query || item.searchText.includes(query))
      .sort((a, b) => (
        itemTargetValue(b, state.optimizerTarget) - itemTargetValue(a, state.optimizerTarget)
        || itemMitigationValue(b) - itemMitigationValue(a)
        || a.name.localeCompare(b.name)
      ));
  }

  function renderCandidateCard(item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `candidate-card${state.loadout[state.selectedSlot] === item.id ? " is-equipped" : ""}`;
    button.style.setProperty("--slot-color", selectedSlotMeta().color);
    button.append(createImage(item));

    const copy = document.createElement("div");
    copy.className = "candidate-copy";

    const type = document.createElement("span");
    type.className = "candidate-type";
    type.textContent = cleanIdLikeText(item.type);

    const name = document.createElement("strong");
    name.className = "candidate-name";
    name.textContent = item.name;

    const stats = document.createElement("div");
    stats.className = "candidate-stats";
    candidatePassiveEntries(item).forEach(([key, value]) => {
      const chip = document.createElement("span");
      chip.className = key === state.optimizerTarget ? "candidate-stat is-target" : "candidate-stat";
      chip.textContent = `${formatSignedStatValue(key, value)} ${key === state.optimizerTarget ? optimizerTargetLabel(key) : statDisplayLabel(key)}`;
      stats.append(chip);
    });
    if (item.twoHanded) {
      const chip = document.createElement("span");
      chip.className = "candidate-stat";
      chip.textContent = "Two Handed";
      stats.append(chip);
    }

    const owned = document.createElement("div");
    owned.className = "candidate-owned";
    if (state.ownedItemIds.has(item.id)) {
      const chip = document.createElement("span");
      chip.textContent = "Owned";
      owned.append(chip);
    }

    copy.append(type, name, stats, owned);
    button.append(copy);
    button.addEventListener("click", () => equipItem(state.selectedSlot, item));
    return button;
  }

  function renderCandidates() {
    const slot = selectedSlotMeta();
    const candidates = candidateItems();

    els.candidateList.innerHTML = "";
    const focusText = isHandSlot(slot.key) && state.weaponFocus !== "any"
      ? ` / ${weaponFocusLabel()}`
      : "";
    els.pickerMeta.textContent = slot.locked
      ? "Locked"
      : `${slot.label}${focusText} / ${formatNumber(candidates.length)} items`;

    if (!slot.locked) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "candidate-clear";
      clear.textContent = "Empty Slot";
      clear.addEventListener("click", () => clearSlot(slot.key));
      els.candidateList.append(clear);
    }

    if (!candidates.length) {
      const status = document.createElement("div");
      status.className = "empty-state";
      status.textContent = slot.locked ? "Neck is always empty." : "No items match this slot and filter.";
      els.candidateList.append(status);
      return;
    }

    candidates.forEach((item) => els.candidateList.append(renderCandidateCard(item)));
  }

  function renderSummary() {
    const result = evaluateLoadout();
    const target = state.optimizerTarget;
    const rows = [];
    const targetValue = targetValueFromStats(result.stats, target);
    const setStats = setBonusStats(result.activeSetBonuses);

    if (targetValue) {
      rows.push({
        key: target,
        label: RESISTANCE_STATS.includes(target) && (result.stats.get("All Resistances") || 0)
          ? `${target} Effective`
          : optimizerTargetLabel(target),
        value: targetValue,
        target: true,
      });
    }

    result.stats.forEach((value, key) => {
      if (!value) return;
      if (HIDDEN_PASSIVE_STATS.has(key)) return;
      rows.push({ key, label: key, value, target: false });
    });

    result.blessingStats.forEach((value, key) => {
      rows.push({ key, label: statDisplayLabel(key), value, target: false });
    });

    const seen = new Set();
    const uniqueRows = rows
      .filter((row) => {
        const key = row.key;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        if (a.target !== b.target) return a.target ? -1 : 1;
        return statSortIndex(a.key) - statSortIndex(b.key) || a.label.localeCompare(b.label);
      });

    els.passiveSummary.innerHTML = "";
    if (!uniqueRows.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No passive stats equipped.";
      els.passiveSummary.append(empty);
    } else {
      uniqueRows.forEach((row) => {
        const div = document.createElement("div");
        div.className = `stat-row${row.target ? " is-target" : ""}`;
        const label = document.createElement("span");
        label.textContent = row.label;
        const valueWrap = document.createElement("div");
        valueWrap.className = "stat-value-wrap";
        const setContribution = setContributionForRow(setStats, row);
        const baseValue = statValueForRow(result.baseStats, row);
        const procValue = statValueForRow(averageStats(result.baseStats, result.conditionalProcStats), row);
        const hasConditionalBoost = procValue !== baseValue;
        if (setContribution) {
          const setBadge = document.createElement("span");
          setBadge.className = "set-bonus-badge";
          setBadge.textContent = `Set ${formatSignedStatValue(row.key, setContribution)}`;
          valueWrap.append(setBadge);
        }
        if (hasConditionalBoost) {
          const breakdown = document.createElement("strong");
          breakdown.className = "conditional-breakdown";
          breakdown.textContent = formatConditionalBreakdown(row, baseValue, procValue, row.value);
          valueWrap.append(breakdown);
        } else {
          const value = document.createElement("strong");
          value.textContent = formatStatValue(row.key, row.value);
          valueWrap.append(value);
        }
        div.append(label, valueWrap);
        els.passiveSummary.append(div);
      });
    }

    els.procSummary.innerHTML = "";
    if (!result.procs.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No procs equipped.";
      els.procSummary.append(empty);
    } else {
      result.procs.forEach((proc) => {
        const div = document.createElement("div");
        div.className = "proc-row";
        const source = document.createElement("span");
        source.className = "proc-source";
        source.textContent = proc.source;
        const text = document.createElement("div");
        text.className = "proc-text";
        text.textContent = proc.text;
        div.append(source, text);
        els.procSummary.append(div);
      });
    }

    const activeSets = result.activeSetBonuses.length;
    els.summaryMeta.textContent = `${formatNumber(result.items.length)} items / ${formatNumber(activeSets)} set bonuses`;
  }

  function renderDetailStats(item, parent) {
    const stats = [
      ["Slot", cleanIdLikeText(item.slot)],
      ["Equip Type", cleanIdLikeText(item.type)],
    ];
    if (item.twoHanded) stats.push(["Two Handed", "yes"]);
    stats.push(["Owned", state.ownedItemIds.has(item.id) ? "yes" : "no"]);

    const section = document.createElement("section");
    section.className = "detail-section";
    const heading = document.createElement("h2");
    heading.textContent = "Stats";
    const grid = document.createElement("div");
    grid.className = "detail-stat-grid";

    stats.forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "detail-stat";
      const labelEl = document.createElement("span");
      labelEl.className = "detail-label";
      labelEl.textContent = label;
      const valueEl = document.createElement("strong");
      valueEl.textContent = value;
      tile.append(labelEl, valueEl);
      grid.append(tile);
    });

    section.append(heading, grid);
    parent.append(section);
  }

  function renderChipSection(parent, title, values) {
    const cleaned = values.filter((value) => value !== undefined && value !== null && String(value) !== "");
    if (!cleaned.length) return;

    const section = document.createElement("section");
    section.className = "detail-section";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const row = document.createElement("div");
    row.className = "chip-row";
    cleaned.forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "detail-chip";
      chip.textContent = String(value);
      row.append(chip);
    });
    section.append(heading, row);
    parent.append(section);
  }

  function formatConditionalBoost(boost) {
    return `${formatNumber(boost.chance * 100)}% chance: ${formatSignedStatValue(boost.key, boost.amount)} ${boost.key} / avg ${formatSignedStatValue(boost.key, boost.avg)}`;
  }

  function renderTextSection(parent, title, value) {
    if (!String(value || "").trim()) return;
    const section = document.createElement("section");
    section.className = "detail-section";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const block = document.createElement("div");
    block.className = "detail-copy";
    block.textContent = String(value);
    section.append(heading, block);
    parent.append(section);
  }

  function renderDetailTabs() {
    const tabs = document.createElement("div");
    tabs.className = "detail-tabs";

    [
      ["info", "Info"],
      ["locations", "Locations"],
    ].forEach(([key, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `detail-tab${state.detailTab === key ? " is-active" : ""}`;
      button.textContent = label;
      button.addEventListener("click", () => {
        if (state.detailTab === key) return;
        state.detailTab = key;
        saveStoredState();
        renderDetail();
      });
      tabs.append(button);
    });

    return tabs;
  }

  function renderLocationDetails(item, parent) {
    renderTextSection(parent, "Locations", item.locationText.trim() || "No known locations");
    renderChipSection(parent, "Tags", item.locationTags.map(formatLocationTag));
  }

  function renderDetail() {
    const item = itemById(state.selectedId);
    els.detailPanel.innerHTML = "";

    const header = document.createElement("div");
    header.className = "panel-heading detail-heading";
    const heading = document.createElement("h1");
    heading.textContent = "Selected Item";
    const meta = document.createElement("span");
    meta.className = "panel-meta";
    meta.textContent = item ? cleanIdLikeText(item.slot) : "None";
    header.append(heading, meta);

    if (!item) {
      const body = document.createElement("div");
      body.className = "detail-body";
      const empty = document.createElement("div");
      empty.className = "empty-detail";
      empty.textContent = state.items.length ? "No item selected." : "Loading item data...";
      body.append(empty);
      els.detailPanel.append(header, body);
      return;
    }

    const body = document.createElement("div");
    body.className = "detail-body";

    const hero = document.createElement("section");
    hero.className = "detail-hero";
    hero.append(createImage(item));
    const heroText = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "detail-title";
    title.textContent = item.name;
    const subtitle = document.createElement("div");
    subtitle.className = "detail-subtitle";
    subtitle.textContent = cleanIdLikeText(item.type);
    heroText.append(title, subtitle);
    hero.append(heroText);
    body.append(hero);

    if (state.detailTab === "locations") {
      renderLocationDetails(item, body);
    } else {
      renderDetailStats(item, body);
      renderChipSection(body, "Sets", item.itemSetIds.map(setLabel));
      renderChipSection(
        body,
        "Parsed Passives",
        [...item.baseStats.entries()]
          .filter(([key, value]) => value && !HIDDEN_PASSIVE_STATS.has(key))
          .sort((a, b) => statSortIndex(a[0]) - statSortIndex(b[0]))
          .map(([key, value]) => `${formatSignedStatValue(key, value)} ${key}`),
      );
      renderChipSection(
        body,
        "Conditional Stat Boosts",
        item.conditionalBoosts
          .filter((boost) => !HIDDEN_PASSIVE_STATS.has(boost.key))
          .map(formatConditionalBoost),
      );
      renderTextSection(body, "Effects", item.effects);
      renderTextSection(body, "Description", item.description);
    }

    els.detailPanel.append(header, renderDetailTabs(), body);
  }

  function clearLoadout() {
    state.loadout = {};
    state.selectedId = "";
    saveStoredState();
    renderAll();
    setStatus("Loadout cleared.");
  }

  function renderAll() {
    renderSlots();
    renderSetPicker();
    renderCandidates();
    renderSummary();
    renderDetail();
  }

  function updateLocationFilters() {
    state.includeLimitedTime = els.includeLimitedTime.checked;
    state.includeLimitedRaids = els.includeLimitedRaids.checked;
    autoOptimizeLoadout();
  }

  function bindEvents() {
    els.optimizerTarget.addEventListener("change", () => {
      state.optimizerTarget = els.optimizerTarget.value;
      autoOptimizeLoadout();
    });

    els.optimizerScope.addEventListener("change", () => {
      state.optimizerScope = els.optimizerScope.value === "owned" ? "owned" : "all";
      autoOptimizeLoadout();
    });

    els.weaponFocus.addEventListener("change", () => {
      state.weaponFocus = WEAPON_FOCUS_META[els.weaponFocus.value] ? els.weaponFocus.value : "any";
      autoOptimizeLoadout();
    });

    els.includeLimitedTime.addEventListener("change", updateLocationFilters);
    els.includeLimitedRaids.addEventListener("change", updateLocationFilters);

    els.pickerScope.addEventListener("change", () => {
      state.pickerScope = els.pickerScope.value === "owned" ? "owned" : "all";
      saveStoredState();
      renderCandidates();
    });

    els.itemSearch.addEventListener("input", () => {
      state.pickerQuery = els.itemSearch.value;
      renderCandidates();
    });

    els.setPicker.addEventListener("change", () => selectSetLoadout(els.setPicker.value));
    els.clearLoadout.addEventListener("click", clearLoadout);

    window.addEventListener("storage", (event) => {
      if (event.key !== INVENTORY_STORAGE_KEY) return;
      state.ownedItemIds = readOwnedItemIds();
      if (state.optimizerScope === "owned") {
        autoOptimizeLoadout();
      } else {
        renderAll();
      }
    });
  }

  function applyStoredState() {
    const stored = readStoredState();
    const loadout = stored.loadout && typeof stored.loadout === "object" ? stored.loadout : {};
    state.loadout = REAL_SLOT_KEYS.reduce((next, slotKey) => {
      const item = itemById(loadout[slotKey]);
      if (item && compatibleWithSlot(item, slotKey)) next[slotKey] = item.id;
      return next;
    }, {});
    state.selectedSlot = REAL_SLOT_KEYS.includes(stored.selectedSlot) ? stored.selectedSlot : "helm";
    state.pickerScope = stored.pickerScope === "owned" ? "owned" : "all";
    state.optimizerScope = stored.optimizerScope === "owned" ? "owned" : "all";
    state.weaponFocus = WEAPON_FOCUS_META[stored.weaponFocus] ? stored.weaponFocus : "any";
    state.detailTab = stored.detailTab === "locations" ? "locations" : "info";
    state.includeLimitedTime = stored.includeLimitedTime !== false;
    state.includeLimitedRaids = stored.includeLimitedRaids !== false;
    enforceItemFiltersOnLoadout();
    state.optimizerTarget = typeof stored.optimizerTarget === "string" ? stored.optimizerTarget : "Crit Damage";
    state.selectedId = slotDisplayItem(state.selectedSlot)?.id || "";

    els.itemSearch.value = state.pickerQuery;
    els.pickerScope.value = state.pickerScope;
    els.optimizerScope.value = state.optimizerScope;
    els.weaponFocus.value = state.weaponFocus;
    els.includeLimitedTime.checked = state.includeLimitedTime;
    els.includeLimitedRaids.checked = state.includeLimitedRaids;
  }

  async function boot() {
    try {
      const [itemsData, itemLocations] = await Promise.all([
        loadJson(DATA_PATHS.items),
        loadJson(DATA_PATHS.itemLocations),
      ]);
      state.ownedItemIds = readOwnedItemIds();
      state.items = buildItems(itemsData, itemLocations);
      state.itemsById = new Map(state.items.map((item) => [item.id, item]));
      state.setBonuses = buildSetBonuses(state.items);
      applyStoredState();
      renderOptimizerTargets();
      bindEvents();
      autoOptimizeLoadout();
    } catch (error) {
      setStatus(error.message, true);
      els.candidateList.innerHTML = `<div class="empty-state">${error.message}</div>`;
      els.detailPanel.innerHTML = `<div class="empty-detail">${error.message}</div>`;
    }
  }

  boot();
})();
