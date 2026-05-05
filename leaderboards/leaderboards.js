(function () {
  "use strict";

  const API_URL = "https://statvault-sync.mattias-cb7.workers.dev/leaderboards";
  const GROUPS = [
    { key: "overall", label: "Overall" },
    { key: "raids", label: "Raids" },
    { key: "damage", label: "Damage" },
    { key: "destroyers", label: "Highest Hit" },
    { key: "levels_gained", label: "Levels Gained" },
    { key: "sp_gained", label: "SP Gained" },
    { key: "hall", label: "Milestones" },
  ];
  const DEFAULT_BOARDS = {
    overall: [
      { key: "level", label: "Level" },
      { key: "total_sp", label: "Total SP" },
      { key: "sp_per_level", label: "SP / Level" },
    ],
    destroyers: [
      { key: "1d", label: "Daily" },
      { key: "7d", label: "7 Days" },
      { key: "30d", label: "30 Days" },
      { key: "all_time", label: "All Time" },
    ],
  };
  const ACTIVITY_BOARDS = [
    { key: "1d", label: "Daily" },
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
  ];

  const state = {
    group: "overall",
    board: "",
    cache: new Map(),
  };

  const els = {
    groups: document.getElementById("leaderboardGroups"),
    boards: document.getElementById("leaderboardBoards"),
    content: document.getElementById("leaderboardContent"),
  };

  function formatNumber(value) {
    return Number(value).toLocaleString("en-US", {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    });
  }

  function formatValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return formatNumber(value);
    }
    return value ?? "";
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toISOString().slice(0, 10);
  }

  function toTitleCase(value) {
    return String(value ?? "").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function createButton(label, isActive, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-control${isActive ? " is-active" : ""}`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderGroups() {
    els.groups.innerHTML = "";
    GROUPS.forEach((group) => {
      els.groups.appendChild(createButton(group.label, group.key === state.group, () => {
        if (state.group === group.key) return;
        state.group = group.key;
        state.board = "";
        render();
      }));
    });
  }

  function getBoardOptions(group, data) {
    if (group === "hall") {
      return (data?.tiers || Object.keys(data?.boards || {})).map((tier) => ({
        key: String(tier),
        label: getHallTierLabel(tier),
      }));
    }

    return DEFAULT_BOARDS[group] || ACTIVITY_BOARDS;
  }

  function getHallTierLabel(tier) {
    switch (String(tier)) {
      case "10":
        return "Farmers";
      case "100":
        return "Adventurers";
      case "500":
        return "Heroes";
      case "1000":
        return "Champions";
      default:
        return String(tier);
    }
  }

  function ensureBoard(options) {
    if (options.some((board) => board.key === state.board)) return;
    state.board = options[0]?.key || "";
  }

  function renderBoards(data) {
    const options = getBoardOptions(state.group, data);
    ensureBoard(options);
    els.boards.innerHTML = "";

    options.forEach((board) => {
      els.boards.appendChild(createButton(board.label, board.key === state.board, () => {
        if (state.board === board.key) return;
        state.board = board.key;
        renderData(data);
      }));
    });
  }

  function setStatus(message) {
    els.content.className = "leaderboard-status";
    els.content.textContent = message;
  }

  async function loadGroup(group) {
    if (state.cache.has(group)) {
      return state.cache.get(group);
    }

    const url = new URL(API_URL);
    url.searchParams.set("group", group);
    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(`Leaderboard request failed with status ${response.status}`);
    }

    const data = await response.json();
    state.cache.set(group, data);
    return data;
  }

  async function render() {
    renderGroups();
    els.boards.innerHTML = "";
    setStatus("Loading leaderboard data...");

    try {
      const data = await loadGroup(state.group);
      renderData(data);
    } catch (error) {
      setStatus(`Could not load leaderboards: ${error.message}`);
    }
  }

  function renderData(data) {
    renderGroups();
    renderBoards(data);

    const board = data?.boards?.[state.board];
    if (!state.board) {
      setStatus("No leaderboard data is available for this category yet.");
      return;
    }
    if (!board) {
      setStatus("This leaderboard board has no data yet.");
      return;
    }

    const rows = Array.isArray(board.top) ? board.top : [];
    if (!rows.length) {
      setStatus("No players are on this board yet.");
      return;
    }

    els.content.className = "table-wrap";
    els.content.innerHTML = "";
    els.content.appendChild(buildTable(rows));
  }

  function buildTable(rows) {
    const table = document.createElement("table");
    table.className = "leaderboard-table";

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    const columns = state.group === "hall"
      ? [
        { label: "#", key: "rank", className: "rank-cell numeric" },
        { label: "Name", key: "characterName" },
        { label: "Class", key: "className" },
        { label: "Reached", key: "date", className: "numeric" },
      ]
      : [
        { label: "#", key: "rank", className: "rank-cell numeric" },
        { label: "Name", key: "characterName" },
        { label: getValueLabel(), key: "value", className: "numeric" },
      ];

    columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column.label;
      th.className = column.className || "";
      headerRow.appendChild(th);
    });

    const tbody = table.createTBody();
    rows.forEach((row, index) => {
      const tr = tbody.insertRow();
      columns.forEach((column) => {
        const td = tr.insertCell();
        td.className = column.className || "";
        td.textContent = cellValue(column.key, row, index);
      });
    });

    return table;
  }

  function getValueLabel() {
    if (state.group === "overall") {
      switch (state.board) {
        case "level":
          return "Level";
        case "total_sp":
          return "Total SP";
        case "sp_per_level":
          return "SP / Level";
        default:
          return "Value";
      }
    }

    switch (state.group) {
      case "raids":
        return "Raids";
      case "damage":
        return "Damage";
      case "destroyers":
        return "Highest Hit";
      case "levels_gained":
        return "Levels";
      case "sp_gained":
        return "Stat Points";
      default:
        return "Value";
    }
  }

  function cellValue(key, row, index) {
    switch (key) {
      case "rank":
        return formatNumber(index + 1);
      case "className":
        return toTitleCase(row.className);
      case "date":
        return formatDate(row.date);
      default:
        return formatValue(row[key]);
    }
  }

  render();
})();
