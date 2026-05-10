(function () {
  "use strict";

  const stats = [
    { key: "constitution", label: "Constitution" },
    { key: "strength", label: "Strength" },
    { key: "agility", label: "Agility" },
    { key: "intellect", label: "Intellect" },
    { key: "perception", label: "Perception" },
    { key: "leadership", label: "Leadership" },
  ];

  const INPUT_STORAGE_KEY = "dotv-sp-calc-inputs-v1";

  const numberFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  });

  const durationFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  });

  const els = {
    rows: document.getElementById("spCalcRows"),
    spPerDay: document.getElementById("spPerDay"),
    currentSpTotal: document.getElementById("currentSpTotal"),
    goalSpTotal: document.getElementById("goalSpTotal"),
    totalCost: document.getElementById("totalCost"),
    timeToGoal: document.getElementById("timeToGoal"),
    timeToGoalMeta: document.getElementById("timeToGoalMeta"),
  };

  if (!els.rows || !els.spPerDay || !els.currentSpTotal || !els.goalSpTotal || !els.totalCost || !els.timeToGoal || !els.timeToGoalMeta) {
    return;
  }

  function readStoredInputs() {
    if (typeof localStorage === "undefined") return {};
    try {
      const storedInputs = JSON.parse(localStorage.getItem(INPUT_STORAGE_KEY) || "{}");
      return storedInputs && typeof storedInputs === "object" ? storedInputs : {};
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

  function statToSp(value) {
    let sp = 0;

    if (value <= 10000) {
      return value;
    }

    let inc;
    let startCost;

    if (value <= 25000) {
      sp += 10000;
      value -= 10000;
      inc = 1500;
      startCost = 2;
    } else {
      sp += 107500;
      value -= 25000;
      inc = 1000;
      startCost = 12;
    }

    const endCost = Math.floor(value / inc) + startCost - 1;
    const numIncrements = endCost - startCost + 1;

    sp += (numIncrements / 2) * (startCost + endCost) * inc;
    sp += (value % inc) * (endCost + 1);
    return sp;
  }

  function parseStatValue(input) {
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.floor(value));
  }

  function parseDailyValue(input) {
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, value);
  }

  function formatNumber(value) {
    return numberFormatter.format(Math.round(value));
  }

  function formatDurationParts(days) {
    if (days <= 0) {
      return { primary: "Goal reached", secondary: "" };
    }

    if (days < 1) {
      return { primary: "< 1 day", secondary: "" };
    }

    if (days < 14) {
      const dayLabel = days === 1 ? "day" : "days";
      return { primary: `${durationFormatter.format(days)} ${dayLabel}`, secondary: "" };
    }

    if (days < 365) {
      return {
        primary: `${durationFormatter.format(days)} days`,
        secondary: `${durationFormatter.format(days / 7)} weeks`,
      };
    }

    return {
      primary: `${durationFormatter.format(days)} days`,
      secondary: `${durationFormatter.format(days / 365)} years`,
    };
  }

  function setFormattedValue(el, value) {
    el.textContent = formatNumber(value);
  }

  function storedInputValue(value, fallback = "0") {
    return value === undefined || value === null ? fallback : String(value);
  }

  const storedInputs = readStoredInputs();
  els.spPerDay.value = storedInputValue(storedInputs.spPerDay);

  const rows = stats.map((stat) => {
    const storedStat = storedInputs.stats?.[stat.key] || {};
    const row = document.createElement("tr");

    const statCell = document.createElement("th");
    statCell.scope = "row";
    statCell.textContent = stat.label;

    const startCell = document.createElement("td");
    const startInput = document.createElement("input");
    startInput.type = "number";
    startInput.min = "0";
    startInput.step = "1";
    startInput.inputMode = "numeric";
    startInput.value = storedInputValue(storedStat.start);
    startInput.setAttribute("aria-label", `${stat.label} start value`);
    startCell.appendChild(startInput);

    const endCell = document.createElement("td");
    const endInput = document.createElement("input");
    endInput.type = "number";
    endInput.min = "0";
    endInput.step = "1";
    endInput.inputMode = "numeric";
    endInput.value = storedInputValue(storedStat.end);
    endInput.setAttribute("aria-label", `${stat.label} end value`);
    endCell.appendChild(endInput);

    const gainCell = document.createElement("td");
    gainCell.className = "numeric sp-gain-cell";
    gainCell.textContent = "0";

    const costCell = document.createElement("td");
    costCell.className = "numeric sp-cost-cell";
    costCell.textContent = "0";

    row.append(statCell, startCell, endCell, gainCell, costCell);
    els.rows.appendChild(row);

    const rowFields = {
      key: stat.key,
      startInput,
      endInput,
      gainCell,
      costCell,
    };

    syncEndMinimum(rowFields);

    startInput.addEventListener("input", () => {
      clampEndToStart(rowFields);
      updateCalculator();
    });
    endInput.addEventListener("input", () => updateCalculator());
    endInput.addEventListener("change", () => {
      clampEndToStart(rowFields);
      updateCalculator();
    });

    return rowFields;
  });

  function syncEndMinimum(row) {
    row.endInput.min = String(parseStatValue(row.startInput));
  }

  function clampEndToStart(row) {
    const startValue = parseStatValue(row.startInput);
    const endValue = parseStatValue(row.endInput);

    row.endInput.min = String(startValue);

    if (endValue < startValue) {
      row.endInput.value = String(startValue);
      return true;
    }

    return false;
  }

  function currentInputValues() {
    return {
      spPerDay: els.spPerDay.value,
      stats: rows.reduce((values, row) => {
        values[row.key] = {
          start: row.startInput.value,
          end: row.endInput.value,
        };
        return values;
      }, {}),
    };
  }

  function saveInputValues() {
    writeStoredInputs(currentInputValues());
  }

  function updateCalculator({ save = true } = {}) {
    let currentSpTotal = 0;
    let goalSpTotal = 0;

    rows.forEach((row) => {
      const startValue = parseStatValue(row.startInput);
      const endValue = Math.max(startValue, parseStatValue(row.endInput));
      const statGain = endValue - startValue;
      const startSp = statToSp(startValue);
      const endSp = statToSp(endValue);
      const cost = endSp - startSp;

      syncEndMinimum(row);
      currentSpTotal += startSp;
      goalSpTotal += endSp;
      setFormattedValue(row.gainCell, statGain);
      setFormattedValue(row.costCell, cost);
    });

    const totalCost = goalSpTotal - currentSpTotal;

    setFormattedValue(els.currentSpTotal, currentSpTotal);
    setFormattedValue(els.goalSpTotal, goalSpTotal);
    setFormattedValue(els.totalCost, totalCost);

    const spPerDay = parseDailyValue(els.spPerDay);
    const duration = totalCost <= 0
      ? { primary: "Goal reached", secondary: "" }
      : spPerDay > 0
        ? formatDurationParts(totalCost / spPerDay)
        : { primary: "Enter SP/day", secondary: "" };
    els.timeToGoal.textContent = duration.primary;
    els.timeToGoalMeta.textContent = duration.secondary;

    if (save) {
      saveInputValues();
    }
  }

  els.spPerDay.addEventListener("input", () => updateCalculator());

  let normalizedStoredInputs = false;
  rows.forEach((row) => {
    normalizedStoredInputs = clampEndToStart(row) || normalizedStoredInputs;
  });
  updateCalculator({ save: normalizedStoredInputs });
})();
