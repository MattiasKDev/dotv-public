(function () {
  "use strict";

  const DATA_PATHS = {
    items: "../data/items.json",
    formations: "../data/formations.json",
    itemLocations: "../data/item-locations.json",
  };
  const IMAGE_HOST = "https://files.dragonsofthevoid.com";
  const INVENTORY_STORAGE_KEY = "commander-formation-ranker-inputs-v1";
  const HIDE_OWNED_ENABLED = true;
  const UNKNOWN_LOCATION_TAG = "unknown";
  const PAGE_SIZE = 120;

  const PREFIX_LABELS = {
    e: "equipment",
    f: "formations",
    c: "craftables",
    a: "commander/troop",
    k: "skills",
    u: "consumables",
    ba: "banners",
    cp: "cash purchases",
    ru: "runes",
    s: "scrolls",
    m: "magics",
    dy: "dyes",
    p: "sp/skp",
    g: "currency",
  };

  const VISIBLE_CATEGORIES = new Set([
    "equipment",
    "formations",
    "commanders",
    "troops",
    "craftables",
    "consumables",
    "scrolls",
    "magics",
  ]);

  const CATEGORY_META = [
    { key: "equipment", label: "Equipment", color: "#f0b35a" },
    { key: "formations", label: "Formations", color: "#56d4bf" },
    { key: "commanders", label: "Commanders", color: "#ff9b72" },
    { key: "troops", label: "Troops", color: "#7ee787" },
    { key: "craftables", label: "Craftables", color: "#d2a8ff" },
    { key: "skills", label: "Skills", color: "#79c0ff" },
    { key: "consumables", label: "Consumables", color: "#a5d6ff" },
    { key: "banners", label: "Banners", color: "#f2cc60" },
    { key: "cash", label: "Cash Purchases", color: "#ffa657" },
    { key: "runes", label: "Runes", color: "#ff7b72" },
    { key: "scrolls", label: "Scrolls", color: "#dbb2ff" },
    { key: "magics", label: "Magics", color: "#a5d6ff" },
    { key: "dyes", label: "Dyes", color: "#f778ba" },
    { key: "points", label: "SP/SKP", color: "#c9d1d9" },
    { key: "currency", label: "Currency", color: "#7ee787" },
    { key: "other", label: "Other", color: "#8b949e" },
  ];

  const CATEGORY_BY_PREFIX = {
    e: "equipment",
    f: "formations",
    c: "craftables",
    k: "skills",
    u: "consumables",
    ba: "banners",
    cp: "cash",
    ru: "runes",
    s: "scrolls",
    m: "magics",
    dy: "dyes",
    p: "points",
    g: "currency",
  };

  const SORT_OPTIONS = {
    all: [
      { key: "name", label: "Name" },
    ],
    equipment: [
      { key: "name", label: "Name" },
      { key: "attack", label: "Attack" },
      { key: "defense", label: "Defense" },
    ],
    formations: [
      { key: "name", label: "Name" },
      { key: "formationBonus", label: "Formation Bonus" },
      { key: "protect", label: "Protection" },
      { key: "slots", label: "Slots" },
    ],
    commanders: [
      { key: "name", label: "Name" },
      { key: "attack", label: "Attack" },
      { key: "defense", label: "Defense" },
      { key: "health", label: "Health" },
    ],
    troops: [
      { key: "name", label: "Name" },
      { key: "attack", label: "Attack" },
      { key: "defense", label: "Defense" },
      { key: "reserve", label: "Reserve" },
    ],
    craftables: [
      { key: "name", label: "Name" },
    ],
    consumables: [
      { key: "name", label: "Name" },
    ],
    scrolls: [
      { key: "name", label: "Name" },
    ],
    magics: [
      { key: "name", label: "Name" },
    ],
  };

  const STAT_REQUIREMENTS = [
    { keys: ["reqcon", "reccon"], label: "Constitution" },
    { keys: ["reqper", "reqperc", "recper", "recperc"], label: "Perception" },
    { keys: ["reqstr", "recstr"], label: "Strength" },
    { keys: ["reqint", "recint"], label: "Intellect" },
    { keys: ["reqagi", "recagi"], label: "Agility" },
    { keys: ["reqlea", "reclea"], label: "Leadership" },
  ];

  const state = {
    items: [],
    filteredItems: [],
    ownedItemIds: new Set(),
    selectedId: "",
    category: "all",
    availability: "obtainable",
    query: "",
    hiddenTags: new Set(),
    tagFilterMode: "exclude",
    equipmentSlot: "",
    equipmentType: "",
    equipmentSet: "",
    commanderRace: "",
    commanderRole: "",
    commanderTrait: "",
    magicElement: "",
    acquireOnceOnly: false,
    uniqueOnly: false,
    hideOwned: false,
    searchSetBonuses: false,
    sort: "name",
    detailTab: "info",
    visibleLimit: PAGE_SIZE,
  };

  const els = {
    totalCount: document.getElementById("totalCount"),
    typeTabs: document.getElementById("typeTabs"),
    locationTagFilters: document.getElementById("locationTagFilters"),
    tagFilterMode: document.getElementById("tagFilterMode"),
    selectAllTags: document.getElementById("selectAllTags"),
    deselectAllTags: document.getElementById("deselectAllTags"),
    searchInput: document.getElementById("searchInput"),
    searchSetBonusesField: document.getElementById("searchSetBonusesField"),
    searchSetBonusesFilter: document.getElementById("searchSetBonusesFilter"),
    controlRow: document.getElementById("controlRow"),
    sortControl: document.getElementById("sortControl"),
    globalFilters: document.getElementById("globalFilters"),
    hideOwnedFilter: document.getElementById("hideOwnedFilter"),
    equipmentFilters: document.getElementById("equipmentFilters"),
    equipmentSlotFilter: document.getElementById("equipmentSlotFilter"),
    equipmentTypeFilter: document.getElementById("equipmentTypeFilter"),
    equipmentSetFilter: document.getElementById("equipmentSetFilter"),
    commanderFilters: document.getElementById("commanderFilters"),
    commanderRaceFilter: document.getElementById("commanderRaceFilter"),
    commanderRoleFilter: document.getElementById("commanderRoleFilter"),
    commanderTraitFilter: document.getElementById("commanderTraitFilter"),
    magicFilters: document.getElementById("magicFilters"),
    magicElementFilter: document.getElementById("magicElementFilter"),
    traitFilters: document.getElementById("traitFilters"),
    acquireOnceFilterField: document.getElementById("acquireOnceFilterField"),
    acquireOnceFilter: document.getElementById("acquireOnceFilter"),
    uniqueFilterField: document.getElementById("uniqueFilterField"),
    uniqueFilter: document.getElementById("uniqueFilter"),
    sortSelect: document.getElementById("sortSelect"),
    clearFilters: document.getElementById("clearFilters"),
    resultCount: document.getElementById("resultCount"),
    resultList: document.getElementById("resultList"),
    detailPanel: document.getElementById("detailPanel"),
  };

  async function loadJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.json();
  }

  function prefixForId(id) {
    return String(id || "").split(".")[0] || "";
  }

  function categoryForItem(item, prefix) {
    if (prefix === "a") {
      if (item.type === "commander") return "commanders";
      if (item.type === "troop") return "troops";
      return "other";
    }
    return CATEGORY_BY_PREFIX[prefix] || "other";
  }

  function categoryMeta(key) {
    return CATEGORY_META.find((entry) => entry.key === key) || CATEGORY_META[CATEGORY_META.length - 1];
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

  function splitCamelText(value) {
    return String(value || "")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\bFul\b/g, "Full")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeSearchText(values) {
    return values.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function stripSetBonusText(value) {
    return String(value || "")
      .split(/\r?\n/)
      .filter((line) => !/^\s*(?:set bonus|\d+\+:)/i.test(line))
      .join("\n");
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number.toLocaleString("en-US", {
      maximumFractionDigits: Number.isInteger(number) ? 0 : 2,
    });
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

  function formatValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) return formatNumber(value);
    if (typeof value === "boolean") return value ? "yes" : "no";
    if (typeof value === "string") return cleanIdLikeText(value);
    return value ?? "";
  }

  function shareUrl() {
    const url = new URL(window.location.href);
    if (state.selectedId) {
      url.searchParams.set("item", state.selectedId);
      url.searchParams.set("tab", state.detailTab);
    } else {
      url.searchParams.delete("item");
      url.searchParams.delete("tab");
    }
    return url.toString();
  }

  function updateShareUrl() {
    if (!window.history?.replaceState) return;
    window.history.replaceState(null, "", shareUrl());
  }

  function markdownEscape(value) {
    return String(value || "").replace(/([\\[\]])/g, "\\$1");
  }

  function applyLinkedState() {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("item");
    const tab = params.get("tab");
    const linkedItem = state.items.find((item) => item.id === itemId);

    if (tab === "locations" || tab === "info") {
      state.detailTab = tab;
    }

    if (linkedItem) {
      state.selectedId = linkedItem.id;
      state.category = linkedItem.category;
    }
  }

  async function copyShareLink(button, item) {
    const url = shareUrl();
    const text = `[${markdownEscape(item.name)}](${url})`;

    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = "Copy Link";
      }, 1200);
    } catch {
      window.prompt("Copy item link", text);
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

  function normalizeItem(rawItem, source, itemLocations) {
    const id = String(rawItem.id || "");
    const prefix = prefixForId(id);
    const category = categoryForItem(rawItem, prefix);
    const meta = categoryMeta(category);
    const locationInfo = itemLocations[id] || null;
    const locationText = String(locationInfo?.locationText || "");
    const locationTags = Array.isArray(locationInfo?.tags)
      ? locationInfo.tags.map(String).filter((tag) => tag.trim() !== "")
      : [];
    if (!locationText.trim() && !locationTags.includes(UNKNOWN_LOCATION_TAG)) {
      locationTags.push(UNKNOWN_LOCATION_TAG);
    }
    const baseSearchValues = [
      id,
      rawItem.name,
      rawItem.type,
      prefix,
      PREFIX_LABELS[prefix],
      meta.label,
      rawItem.rarity,
      rawItem.race,
      rawItem.role,
      rawItem.trait,
      rawItem.equipSlot,
      rawItem.equipType,
      rawItem.itemSlot,
      rawItem.element,
      rawItem.effectName,
      rawItem.description,
      locationText,
      locationTags.join(" "),
      Array.isArray(rawItem.itemSetIds) ? rawItem.itemSetIds.join(" ") : "",
    ];
    const searchText = normalizeSearchText([
      ...baseSearchValues,
      category === "equipment" ? stripSetBonusText(rawItem.effects) : rawItem.effects,
    ]);
    const fullSearchText = normalizeSearchText([
      ...baseSearchValues,
      rawItem.effects,
    ]);

    return {
      raw: rawItem,
      source,
      id,
      prefix,
      category,
      categoryLabel: meta.label,
      categoryColor: meta.color,
      prefixLabel: PREFIX_LABELS[prefix] || "unknown",
      name: String(rawItem.name || id || "Unknown"),
      imageUrl: imageUrl(rawItem.imagePath),
      locationInfo,
      locationTags,
      locationText,
      obtainable: locationInfo?.obtainable === true,
      searchText,
      fullSearchText,
    };
  }

  function buildItems(items, formations, itemLocations) {
    return [
      ...Object.values(items).map((item) => normalizeItem(item, "items", itemLocations)),
      ...Object.values(formations).map((formation) => normalizeItem(formation, "formations", itemLocations)),
    ]
      .filter((item) => VISIBLE_CATEGORIES.has(item.category))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  function matchesAvailability(item) {
    if (state.availability === "obtainable") return item.obtainable;
    if (state.availability === "unobtainable") return !item.obtainable;
    return true;
  }

  function matchesLocationTags(item) {
    if (state.tagFilterMode === "include") {
      return item.locationTags.some((tag) => !state.hiddenTags.has(tag));
    }
    return !item.locationTags.some((tag) => state.hiddenTags.has(tag));
  }

  function matchesOwnedFilter(item) {
    return !HIDE_OWNED_ENABLED || !state.hideOwned || !state.ownedItemIds.has(item.id);
  }

  function equipmentItems() {
    return state.items.filter((item) => item.category === "equipment");
  }

  function equipmentItemsForTypeFilter() {
    return equipmentItems().filter((item) => (
      !state.equipmentSlot || String(item.raw.equipSlot || "") === state.equipmentSlot
    ));
  }

  function uniqueEquipmentValuesForItems(items, getValue) {
    return [...new Set(items
      .flatMap((item) => {
        const value = getValue(item.raw);
        return Array.isArray(value) ? value : [value];
      })
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
      .map(String))]
      .sort((a, b) => a.localeCompare(b));
  }

  function uniqueEquipmentValues(getValue) {
    return uniqueEquipmentValuesForItems(equipmentItems(), getValue);
  }

  function setLabel(setId) {
    return toTitleCase(String(setId || "").replace(/^is\./, ""));
  }

  function fillSelect(selectEl, allLabel, values, selectedValue, labelFn = toTitleCase) {
    selectEl.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = allLabel;
    selectEl.append(allOption);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labelFn(value);
      selectEl.append(option);
    });

    selectEl.value = values.includes(selectedValue) ? selectedValue : "";
  }

  function currentSortOptions() {
    return SORT_OPTIONS[state.category] || SORT_OPTIONS.equipment;
  }

  function ensureValidSort() {
    const options = currentSortOptions();
    if (options.some((option) => option.key === state.sort)) return;
    state.sort = options[0]?.key || "name";
  }

  function renderSortOptions() {
    const options = currentSortOptions();
    els.sortControl.hidden = options.length <= 1;
    els.sortSelect.innerHTML = "";

    options.forEach((sortOption) => {
      const option = document.createElement("option");
      option.value = sortOption.key;
      option.textContent = sortOption.label;
      els.sortSelect.append(option);
    });

    els.sortSelect.value = state.sort;
  }

  function magicItems() {
    return state.items.filter((item) => item.category === "magics");
  }

  function activeCategoryItems() {
    return state.items.filter((item) => item.category === state.category);
  }

  function traitFilterCapabilities() {
    if (!["consumables", "craftables"].includes(state.category)) {
      return { acquireOnce: false, unique: false };
    }

    const items = activeCategoryItems();
    return {
      acquireOnce: items.some((item) => item.raw.acquireOnce),
      unique: items.some((item) => item.raw.unique),
    };
  }

  function renderMagicFilters() {
    const isMagics = state.category === "magics";
    els.magicFilters.hidden = !isMagics;
    if (!isMagics) return;

    fillSelect(
      els.magicElementFilter,
      "All elements",
      [...new Set(magicItems()
        .map((item) => item.raw.element)
        .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
        .map(String))]
        .sort((a, b) => a.localeCompare(b)),
      state.magicElement,
    );
  }

  function renderTraitFilters() {
    const capabilities = traitFilterCapabilities();
    const hasTraitFilters = capabilities.acquireOnce || capabilities.unique;

    els.traitFilters.hidden = !hasTraitFilters;
    els.acquireOnceFilterField.hidden = !capabilities.acquireOnce;
    els.uniqueFilterField.hidden = !capabilities.unique;

    if (!capabilities.acquireOnce) state.acquireOnceOnly = false;
    if (!capabilities.unique) state.uniqueOnly = false;

    els.acquireOnceFilter.checked = state.acquireOnceOnly;
    els.uniqueFilter.checked = state.uniqueOnly;
  }

  function renderGlobalFilters() {
    els.globalFilters.hidden = !HIDE_OWNED_ENABLED;
    if (!HIDE_OWNED_ENABLED) {
      state.hideOwned = false;
    }
    els.hideOwnedFilter.checked = state.hideOwned;
  }

  function renderSearchOptions() {
    const showSetBonusToggle = state.category === "equipment";
    els.searchSetBonusesField.hidden = !showSetBonusToggle;
    if (!showSetBonusToggle) state.searchSetBonuses = false;
    els.searchSetBonusesFilter.checked = state.searchSetBonuses;
  }

  function renderTagModeControl() {
    els.tagFilterMode.querySelectorAll("[data-tag-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tagMode === state.tagFilterMode);
    });
  }

  function renderControlRow() {
    els.controlRow.hidden = els.sortControl.hidden
      && els.globalFilters.hidden
      && els.equipmentFilters.hidden
      && els.commanderFilters.hidden
      && els.magicFilters.hidden
      && els.traitFilters.hidden;
  }

  function equipmentTypeValuesForCurrentSlot() {
    return uniqueEquipmentValuesForItems(
      equipmentItemsForTypeFilter(),
      (item) => item.equipType,
    );
  }

  function equipmentSetValuesForCurrentAvailability() {
    return uniqueEquipmentValuesForItems(
      equipmentItems().filter((item) => matchesAvailability(item) && matchesLocationTags(item) && matchesOwnedFilter(item)),
      (item) => item.itemSetIds || [],
    );
  }

  function ensureValidEquipmentFilters() {
    if (state.category !== "equipment") return;
    const typeValues = equipmentTypeValuesForCurrentSlot();
    if (state.equipmentType && !typeValues.includes(state.equipmentType)) {
      state.equipmentType = "";
    }
    const setValues = equipmentSetValuesForCurrentAvailability();
    if (state.equipmentSet && !setValues.includes(state.equipmentSet)) {
      state.equipmentSet = "";
    }
  }

  function renderEquipmentFilters() {
    const isEquipment = state.category === "equipment";
    els.equipmentFilters.hidden = !isEquipment;
    if (!isEquipment) return;

    const typeValues = equipmentTypeValuesForCurrentSlot();

    fillSelect(
      els.equipmentSlotFilter,
      "All slots",
      uniqueEquipmentValues((item) => item.equipSlot),
      state.equipmentSlot,
    );
    fillSelect(
      els.equipmentTypeFilter,
      "All types",
      typeValues,
      state.equipmentType,
    );
    fillSelect(
      els.equipmentSetFilter,
      "All sets",
      equipmentSetValuesForCurrentAvailability(),
      state.equipmentSet,
      setLabel,
    );
  }

  function commanderItemsForFilters() {
    return state.items.filter((item) => (
      item.category === "commanders"
      && matchesAvailability(item)
      && matchesLocationTags(item)
      && matchesOwnedFilter(item)
    ));
  }

  function uniqueCommanderValues(getValue) {
    return uniqueEquipmentValuesForItems(commanderItemsForFilters(), getValue);
  }

  function ensureValidCommanderFilters() {
    if (state.category !== "commanders") return;

    const raceValues = uniqueCommanderValues((item) => item.race);
    const roleValues = uniqueCommanderValues((item) => item.role);
    const traitValues = uniqueCommanderValues((item) => item.trait);

    if (state.commanderRace && !raceValues.includes(state.commanderRace)) state.commanderRace = "";
    if (state.commanderRole && !roleValues.includes(state.commanderRole)) state.commanderRole = "";
    if (state.commanderTrait && !traitValues.includes(state.commanderTrait)) state.commanderTrait = "";
  }

  function renderCommanderFilters() {
    const isCommanders = state.category === "commanders";
    els.commanderFilters.hidden = !isCommanders;
    if (!isCommanders) return;

    fillSelect(
      els.commanderRaceFilter,
      "All races",
      uniqueCommanderValues((item) => item.race),
      state.commanderRace,
    );
    fillSelect(
      els.commanderRoleFilter,
      "All roles",
      uniqueCommanderValues((item) => item.role),
      state.commanderRole,
    );
    fillSelect(
      els.commanderTraitFilter,
      "All traits",
      uniqueCommanderValues((item) => item.trait),
      state.commanderTrait,
    );
  }

  function renderLocationTagFilters() {
    const tags = [...new Set(state.items.flatMap((item) => item.locationTags))]
      .sort((a, b) => formatLocationTag(a).localeCompare(formatLocationTag(b)));
    const tagCounts = state.items
      .filter(matchesFiltersExceptLocationTags)
      .reduce((counts, item) => {
        item.locationTags.forEach((tag) => {
          counts[tag] = (counts[tag] || 0) + 1;
        });
        return counts;
      }, {});

    els.locationTagFilters.innerHTML = "";

    if (!tags.length) {
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = "No tags found.";
      els.locationTagFilters.append(status);
      return;
    }

    tags.forEach((tag) => {
      const label = document.createElement("label");
      label.className = "tag-filter";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !state.hiddenTags.has(tag);
      input.addEventListener("change", () => {
        if (input.checked) {
          state.hiddenTags.delete(tag);
        } else {
          state.hiddenTags.add(tag);
        }
        state.visibleLimit = PAGE_SIZE;
        applyFilters();
      });

      const text = document.createElement("span");
      text.className = "tag-filter-label";
      text.textContent = `${formatLocationTag(tag)} (${formatNumber(tagCounts[tag] || 0)})`;
      label.append(input, text);
      els.locationTagFilters.append(label);
    });
  }

  function renderTypeTabs() {
    const availableItems = state.items.filter((item) => (
      matchesAvailability(item) && matchesLocationTags(item) && matchesOwnedFilter(item)
    ));
    const counts = availableItems.reduce((map, item) => {
      map[item.category] = (map[item.category] || 0) + 1;
      return map;
    }, {});

    els.totalCount.textContent = formatNumber(availableItems.length);
    els.typeTabs.innerHTML = "";

    [
      { key: "all", label: "All", color: "#58a6ff", count: availableItems.length },
      ...CATEGORY_META
        .filter((category) => VISIBLE_CATEGORIES.has(category.key))
        .map((category) => ({ ...category, count: counts[category.key] || 0 }))
    ]
      .forEach((category) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `type-tab${state.category === category.key ? " is-active" : ""}`;
        button.style.setProperty("--type-color", category.color);
        button.innerHTML = `
          <span>${category.label}</span>
          <span class="type-tab-count">${formatNumber(category.count)}</span>
        `;
        button.addEventListener("click", () => {
          if (state.category === category.key) return;
          state.category = category.key;
          state.visibleLimit = PAGE_SIZE;
          applyFilters();
        });
        els.typeTabs.append(button);
      });
  }

  function matchesFiltersExceptLocationTags(item) {
    if (!matchesAvailability(item)) return false;
    if (!matchesOwnedFilter(item)) return false;
    if (state.category !== "all" && item.category !== state.category) return false;

    if (item.category === "equipment") {
      if (state.equipmentSlot && String(item.raw.equipSlot || "") !== state.equipmentSlot) return false;
      if (state.equipmentType && String(item.raw.equipType || "") !== state.equipmentType) return false;
      if (state.equipmentSet && !Array.isArray(item.raw.itemSetIds)) return false;
      if (state.equipmentSet && !item.raw.itemSetIds.includes(state.equipmentSet)) return false;
    }

    if (item.category === "commanders") {
      if (state.commanderRace && String(item.raw.race || "") !== state.commanderRace) return false;
      if (state.commanderRole && String(item.raw.role || "") !== state.commanderRole) return false;
      if (state.commanderTrait && String(item.raw.trait || "") !== state.commanderTrait) return false;
    }

    if (item.category === "magics" && state.magicElement && String(item.raw.element || "") !== state.magicElement) {
      return false;
    }

    if (state.acquireOnceOnly && !item.raw.acquireOnce) return false;
    if (state.uniqueOnly && !item.raw.unique) return false;

    const query = state.query.toLowerCase().replace(/\s+/g, " ").trim();
    const searchText = state.searchSetBonuses ? item.fullSearchText : item.searchText;
    return !query || searchText.includes(query);
  }

  function matchesFilters(item) {
    return matchesFiltersExceptLocationTags(item) && matchesLocationTags(item);
  }

  function numericSortValue(item, key) {
    switch (key) {
      case "attack":
        return Number(item.raw.attack ?? item.raw.att ?? Number.NEGATIVE_INFINITY);
      case "defense":
        return Number(item.raw.defense ?? item.raw.def ?? Number.NEGATIVE_INFINITY);
      case "magic":
        return Number(item.raw.magic ?? Number.NEGATIVE_INFINITY);
      case "formationBonus":
        return Number(item.raw.bonus ?? Number.NEGATIVE_INFINITY);
      case "protect":
        return Number(item.raw.protect ?? Number.NEGATIVE_INFINITY);
      case "slots":
        return Number((item.raw.expandedCmdrSlots || item.raw.cmdrSlots || []).length || Number.NEGATIVE_INFINITY);
      case "health":
        return Number(item.raw.health ?? Number.NEGATIVE_INFINITY);
      case "reserve":
        return Number(item.raw.reserve ?? Number.NEGATIVE_INFINITY);
      default:
        return Number.NEGATIVE_INFINITY;
    }
  }

  function compareItems(a, b) {
    if (state.sort !== "name") {
      const diff = numericSortValue(b, state.sort) - numericSortValue(a, state.sort);
      if (diff) return diff;
    }

    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  }

  function applyFilters() {
    ensureValidSort();
    ensureValidEquipmentFilters();
    ensureValidCommanderFilters();
    state.filteredItems = state.items.filter(matchesFilters).sort(compareItems);

    if (!state.filteredItems.some((item) => item.id === state.selectedId)) {
      state.selectedId = state.filteredItems[0]?.id || "";
    }
    updateShareUrl();

    renderTypeTabs();
    renderLocationTagFilters();
    renderTagModeControl();
    renderSearchOptions();
    renderSortOptions();
    renderEquipmentFilters();
    renderCommanderFilters();
    renderMagicFilters();
    renderGlobalFilters();
    renderTraitFilters();
    renderControlRow();
    renderResults();
    renderDetail();
  }

  function createImage(item, sizeClass = "") {
    const frame = document.createElement("div");
    frame.className = `item-image ${sizeClass}`.trim();

    if (!item.imageUrl) {
      frame.textContent = initials(item.name);
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

  function renderResults() {
    const visibleItems = state.filteredItems.slice(0, state.visibleLimit);
    els.resultList.innerHTML = "";
    els.resultCount.textContent = state.filteredItems.length
      ? `Showing ${formatNumber(visibleItems.length)} of ${formatNumber(state.filteredItems.length)}`
      : "No items found";

    if (!state.filteredItems.length) {
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = "No items match the current filters.";
      els.resultList.append(status);
      return;
    }

    visibleItems.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `item-result${item.id === state.selectedId ? " is-active" : ""}`;
      button.style.setProperty("--type-color", item.categoryColor);
      button.append(createImage(item));

      const body = document.createElement("div");
      body.className = "item-result-body";
      body.innerHTML = `
        <span class="result-title"></span>
      `;
      body.querySelector(".result-title").textContent = item.name;

      button.append(body);
      button.addEventListener("click", () => {
        state.selectedId = item.id;
        updateShareUrl();
        renderResults();
        renderDetail();
      });
      els.resultList.append(button);
    });

    if (visibleItems.length < state.filteredItems.length) {
      const loadMoreButton = document.createElement("button");
      loadMoreButton.id = "loadMore";
      loadMoreButton.className = "load-more";
      loadMoreButton.type = "button";
      loadMoreButton.textContent = "Load More";
      loadMoreButton.addEventListener("click", () => {
        state.visibleLimit += PAGE_SIZE;
        renderResults();
      });
      els.resultList.append(loadMoreButton);
    }
  }

  function selectedItem() {
    return state.items.find((item) => item.id === state.selectedId) || null;
  }

  function statEntries(item) {
    const raw = item.raw;
    const entries = [];

    if (item.category === "equipment") {
      entries.push(
        ["Slot", raw.equipSlot],
        ["Equip Type", raw.equipType],
        ["Attack", raw.attack],
        ["Defense", raw.defense],
      );
      if (raw.twoHanded) entries.push(["Two Handed", raw.twoHanded]);
    } else if (item.category === "commanders" || item.category === "troops") {
      entries.push(
        ["Race", raw.race],
        ["Role", raw.role],
        ["Trait", raw.trait],
        ["Attack", raw.att],
        ["Defense", raw.def],
      );
      if (item.category === "commanders") entries.push(["Health", raw.health]);
      if (item.category === "troops") entries.push(["Reserve", raw.reserve]);
      if (item.category === "troops" && raw.maxFormationSlots) entries.push(["Special", raw.maxFormationSlots]);
    } else if (item.category === "formations") {
      entries.push(
        ["Formation Bonus", `${formatNumber(raw.bonus)}%`],
        ["Protection", raw.protect],
        ["Commander Slots", (raw.expandedCmdrSlots || []).length],
        ["Troop Slots", (raw.expandedTroopSlots || []).length],
      );
    } else if (item.category === "skills") {
      entries.push(
        ["Raid Usable", raw.raidUsable],
        ["Base Damage", raw.baseDamageSize],
        ["XP Range", raw.xpRangeLower || raw.xpRangeUpper ? `${formatNumber(raw.xpRangeLower)} - ${formatNumber(raw.xpRangeUpper)}` : ""],
        ["Cooldown", raw.cooldownData?.duration],
      );
    } else if (item.category === "runes") {
      entries.push(
        ["Power", raw.power],
        ["Slot", raw.itemSlot],
        ["Abbreviation", raw.abbreviation],
        ["Tradeable", raw.tradeable],
      );
    } else if (item.category === "dyes") {
      entries.push(
        ["Hex", raw.hexCode],
        ["Size", raw.dyeSize],
        ["Slot", raw.itemSlot],
        ["Tradeable", raw.tradeable],
      );
    } else if (item.category === "cash") {
      entries.push(["Cost", raw.centCost ? `$${(Number(raw.centCost) / 100).toFixed(2)}` : ""]);
    } else if (item.category === "magics") {
      entries.push(["Element", raw.element]);
    }

    if (raw.acquireOnce) entries.push(["Acquire Once", raw.acquireOnce]);
    if (raw.unique && !["commanders", "scrolls", "magics"].includes(item.category)) {
      entries.push(["Unique", raw.unique]);
    }
    return entries.filter(([, value]) => value !== undefined && value !== null && String(value) !== "");
  }

  function renderStats(item, parent) {
    const entries = statEntries(item);
    if (!entries.length) return;

    const section = createSection("Stats");
    const grid = document.createElement("div");
    grid.className = "stat-grid";

    entries.forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "stat-tile";
      const labelEl = document.createElement("span");
      labelEl.className = "stat-label";
      labelEl.textContent = label;
      const valueEl = document.createElement("strong");
      valueEl.className = "stat-value";
      valueEl.textContent = formatValue(value);
      tile.append(labelEl, valueEl);
      grid.append(tile);
    });

    section.append(grid);
    parent.append(section);
  }

  function createSection(title) {
    const section = document.createElement("section");
    section.className = "detail-section";
    const heading = document.createElement("h2");
    heading.textContent = title;
    section.append(heading);
    return section;
  }

  function renderTextSection(parent, title, value) {
    if (!value) return;
    const section = createSection(title);
    const block = document.createElement("div");
    block.className = "copy-block";
    block.textContent = String(value);
    section.append(block);
    parent.append(section);
  }

  function chip(text, className = "detail-chip") {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  function renderChipSection(parent, title, values) {
    const cleaned = values.filter((value) => value !== undefined && value !== null && String(value) !== "");
    if (!cleaned.length) return;

    const section = createSection(title);
    const row = document.createElement("div");
    row.className = "chip-row";
    cleaned.forEach((value) => row.append(chip(String(value))));
    section.append(row);
    parent.append(section);
  }

  function formatRequirement(req) {
    if (!req || typeof req !== "object") return String(req || "");
    return [
      req.name,
      req.type,
      req.val,
      req.val2,
    ]
      .filter((value) => value !== undefined && value !== null && String(value) !== "")
      .map((value) => splitCamelText(cleanIdLikeText(value)))
      .join(" ")
      .replace(/^Resource\s+/i, "")
      .trim();
  }

  function formatStatRequirements(raw) {
    return STAT_REQUIREMENTS.flatMap(({ keys, label }) => {
      const value = keys.map((key) => raw[key]).find((entry) => Number(entry) > 0);
      return value ? [`${label} ${formatNumber(value)}`] : [];
    });
  }

  function formatAward(award, normalizeChance = false) {
    if (!award || typeof award !== "object") return String(award || "");
    const chance = normalizeChance ? Number(award.chance) / 100 : Number(award.chance);
    return [
      award.id ? cleanIdLikeText(award.id) : "",
      award.qty ? `x${award.qty}` : "",
      award.chance ? `${formatNumber(chance)}%` : "",
    ].filter(Boolean).join(" ");
  }

  function renderStructuredSections(item, parent) {
    const raw = item.raw;
    const requirements = [
      ...(Array.isArray(raw.preReqs) ? raw.preReqs.map(formatRequirement) : []),
      ...formatStatRequirements(raw),
    ];

    renderChipSection(parent, "Requirements", requirements);
    if (raw.resourceCost && typeof raw.resourceCost === "object") {
      renderChipSection(parent, "Resource Cost", Object.entries(raw.resourceCost).map(([key, value]) => `${toTitleCase(key)} ${formatNumber(value)}`));
    }
    if (Array.isArray(raw.alwaysDrop)) renderChipSection(parent, "Always Drops", raw.alwaysDrop.map(formatAward));
    if (Array.isArray(raw.chanceDrop)) renderChipSection(parent, "Chance Drops", raw.chanceDrop.map((award) => formatAward(award, true)));
    if (Array.isArray(raw.awards)) renderChipSection(parent, "Awards", raw.awards.map(formatAward));
    if (Array.isArray(raw.procs)) renderChipSection(parent, "Rune Rolls", raw.procs.slice(0, 24).map(formatProc));
    if (raw.hexCode) renderDyeSection(raw, parent);
    if (item.category === "formations") renderFormationSlots(raw, parent);
  }

  function formatProc(proc) {
    try {
      const parsed = JSON.parse(proc);
      return [
        parsed.name ? cleanIdLikeText(parsed.name) : "",
        parsed.type ? cleanIdLikeText(parsed.type) : "",
        parsed.amount ? formatNumber(parsed.amount) : "",
        parsed.chance ? `${formatNumber(parsed.chance / 100)}%` : "",
      ].filter(Boolean).join(" ");
    } catch {
      return String(proc);
    }
  }

  function renderDyeSection(raw, parent) {
    const section = createSection("Color");
    const row = document.createElement("div");
    row.className = "chip-row";
    const swatch = document.createElement("span");
    swatch.className = "detail-chip swatch-chip";
    const box = document.createElement("span");
    box.className = "color-swatch";
    box.style.background = raw.hexCode;
    swatch.append(box, document.createTextNode(raw.hexCode));
    row.append(swatch);
    section.append(row);
    parent.append(section);
  }

  function slotLabel(slot) {
    const reqs = [slot.race, slot.role, slot.trait, slot.unitID]
      .filter((value) => value && value !== "any")
      .map(cleanIdLikeText)
      .join(" / ");
    return `DEF ${formatNumber(slot.def)}${reqs ? ` - ${reqs}` : ""}`;
  }

  function renderSlotList(title, slots, parent) {
    if (!Array.isArray(slots) || !slots.length) return;
    const section = createSection(title);
    const group = document.createElement("div");
    group.className = "slot-group";

    slots.forEach((slot) => {
      const row = document.createElement("div");
      row.className = "slot-row";
      const count = document.createElement("span");
      count.className = "slot-count";
      count.textContent = `${formatNumber(slot.slots || 1)}x`;
      const label = document.createElement("span");
      label.className = "detail-chip";
      label.textContent = slotLabel(slot);
      row.append(count, label);
      group.append(row);
    });

    section.append(group);
    parent.append(section);
  }

  function renderFormationSlots(raw, parent) {
    renderSlotList("Commander Slots", raw.cmdrSlots, parent);
    renderSlotList("Troop Slots", raw.troopSlots, parent);
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
        updateShareUrl();
        renderDetail();
      });
      tabs.append(button);
    });

    return tabs;
  }

  function renderDetailHero(item, parent) {
    const hero = document.createElement("section");
    hero.className = "detail-hero";
    hero.append(createImage(item));
    const heroText = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "detail-title";
    title.textContent = item.name;
    heroText.append(title);
    hero.append(heroText);
    parent.append(hero);
  }

  function renderLocationDetails(item, parent) {
    renderTextSection(parent, "Locations", item.locationText.trim() || "No known locations");
    renderChipSection(parent, "Tags", item.locationTags.map(formatLocationTag));
  }

  function renderDetail() {
    const item = selectedItem();
    els.detailPanel.innerHTML = "";

    if (!item) {
      const empty = document.createElement("div");
      empty.className = "detail-empty";
      empty.textContent = state.items.length ? "No item selected." : "Loading item data...";
      els.detailPanel.append(empty);
      document.title = "Item Browser | DOTV Tools";
      return;
    }

    document.title = `${item.name} - ${state.detailTab === "locations" ? "Locations" : "Info"} | DOTV Tools`;

    const header = document.createElement("div");
    header.className = "detail-header";
    const type = document.createElement("span");
    type.className = "result-type";
    type.textContent = item.categoryLabel;
    type.style.color = item.categoryColor;
    const actions = document.createElement("div");
    actions.className = "detail-actions";
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "subtle-button copy-link-button";
    copyButton.textContent = "Copy Link";
    copyButton.addEventListener("click", () => copyShareLink(copyButton, item));
    actions.append(copyButton);
    header.append(type, actions);

    const body = document.createElement("div");
    body.className = "detail-body";

    renderDetailHero(item, body);

    if (state.detailTab === "locations") {
      renderLocationDetails(item, body);
    } else {
      renderStats(item, body);
      renderStructuredSections(item, body);
      renderTextSection(body, "Effects", item.raw.effects);
      renderTextSection(body, "Description", item.raw.description);
    }

    els.detailPanel.append(header, renderDetailTabs(), body);
  }

  function clearFilters() {
    state.query = "";
    state.hiddenTags.clear();
    state.tagFilterMode = "exclude";
    state.equipmentSlot = "";
    state.equipmentType = "";
    state.equipmentSet = "";
    state.commanderRace = "";
    state.commanderRole = "";
    state.commanderTrait = "";
    state.magicElement = "";
    state.acquireOnceOnly = false;
    state.uniqueOnly = false;
    state.hideOwned = false;
    state.searchSetBonuses = false;
    state.sort = "name";
    state.visibleLimit = PAGE_SIZE;
    els.searchInput.value = "";
    els.searchSetBonusesFilter.checked = state.searchSetBonuses;
    els.hideOwnedFilter.checked = state.hideOwned;
    els.sortSelect.value = state.sort;
    applyFilters();
  }

  function bindEvents() {
    els.searchInput.addEventListener("input", () => {
      state.query = els.searchInput.value;
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    els.searchSetBonusesFilter.addEventListener("change", () => {
      state.searchSetBonuses = els.searchSetBonusesFilter.checked;
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    els.searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || els.searchInput.value.trim().toLowerCase() !== "unobtainable") return;
      event.preventDefault();
      state.availability = "unobtainable";
      state.query = "";
      els.searchInput.value = "";
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    els.sortSelect.addEventListener("change", () => {
      state.sort = els.sortSelect.value;
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    els.magicElementFilter.addEventListener("change", () => {
      state.magicElement = els.magicElementFilter.value;
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    els.acquireOnceFilter.addEventListener("change", () => {
      state.acquireOnceOnly = els.acquireOnceFilter.checked;
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    els.uniqueFilter.addEventListener("change", () => {
      state.uniqueOnly = els.uniqueFilter.checked;
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    els.hideOwnedFilter.addEventListener("change", () => {
      if (!HIDE_OWNED_ENABLED) return;
      state.ownedItemIds = readOwnedItemIds();
      state.hideOwned = els.hideOwnedFilter.checked;
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    window.addEventListener("storage", (event) => {
      if (!HIDE_OWNED_ENABLED) return;
      if (event.key !== INVENTORY_STORAGE_KEY) return;
      state.ownedItemIds = readOwnedItemIds();
      if (state.hideOwned) applyFilters();
    });

    els.tagFilterMode.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tag-mode]");
      if (!button || button.dataset.tagMode === state.tagFilterMode) return;
      state.tagFilterMode = button.dataset.tagMode === "include" ? "include" : "exclude";
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    els.selectAllTags.addEventListener("click", () => {
      state.hiddenTags.clear();
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    els.deselectAllTags.addEventListener("click", () => {
      state.items.flatMap((item) => item.locationTags).forEach((tag) => state.hiddenTags.add(tag));
      state.visibleLimit = PAGE_SIZE;
      applyFilters();
    });

    [
      [els.equipmentSlotFilter, "equipmentSlot"],
      [els.equipmentTypeFilter, "equipmentType"],
      [els.equipmentSetFilter, "equipmentSet"],
    ].forEach(([element, key]) => {
      element.addEventListener("change", () => {
        state[key] = element.value;
        if (key === "equipmentSlot") {
          state.equipmentType = "";
        }
        state.visibleLimit = PAGE_SIZE;
        applyFilters();
      });
    });

    [
      [els.commanderRaceFilter, "commanderRace"],
      [els.commanderRoleFilter, "commanderRole"],
      [els.commanderTraitFilter, "commanderTrait"],
    ].forEach(([element, key]) => {
      element.addEventListener("change", () => {
        state[key] = element.value;
        state.visibleLimit = PAGE_SIZE;
        applyFilters();
      });
    });

    els.clearFilters.addEventListener("click", clearFilters);
  }

  async function boot() {
    try {
      const [items, formations, itemLocations] = await Promise.all([
        loadJson(DATA_PATHS.items),
        loadJson(DATA_PATHS.formations),
        loadJson(DATA_PATHS.itemLocations),
      ]);
      state.ownedItemIds = HIDE_OWNED_ENABLED ? readOwnedItemIds() : new Set();
      state.items = buildItems(items, formations, itemLocations);
      applyLinkedState();
      bindEvents();
      applyFilters();
      updateShareUrl();
    } catch (error) {
      els.resultCount.textContent = "Could not load item data";
      els.resultList.innerHTML = "";
      const status = document.createElement("div");
      status.className = "status";
      status.textContent = error.message;
      els.resultList.append(status);
      els.detailPanel.innerHTML = `<div class="detail-empty">${error.message}</div>`;
    }
  }

  boot();
})();
