// ==UserScript==
// @name         stat vault
// @namespace    https://github.com/MattiasKDev
// @author       infinity
// @description  Track player statistics including levels, XP, damage, and raid counts
// @version      2026.04.04
// @match        https://play.dragonsofthevoid.com/*
// @run-at       document-start
// @noframes
// @grant GM_getValue
// @grant GM_setValue
// ==/UserScript==

console.log("stat vault loaded");
let statStore = GM_getValue("statStore", {});

let currentDate = new Date().toISOString().slice(0, 10);

let globalStats = statStore[currentDate] || {
    lvl: 0,
    rc: 0,
    sp: 0,
    xp: 0,
    dmg: 0,
    dmgMax: 0
};

let statSum = 0;

let age = 0;

// ============================================================================
// STYLES
// ============================================================================

const styles = {
    box: `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(1100px, 88vw);
    height: min(75vh, 900px);
    background: #1c140d;
    color: #f5efe6;
    z-index: 99999;
    padding: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid rgba(255, 215, 160, 0.12);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  `,
    header: `
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 16px 20px;
    background: rgba(28, 20, 13, 0.95);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255, 215, 160, 0.12);
  `,
    title: `
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: #f8e6c1;
  `,
    subtitle: `
    font-size: 12px;
    margin-top: 2px;
    color: rgba(255, 220, 170, 0.65);
    font-weight: 500;
  `,
    content: `
    height: calc(100% - 64px);
    overflow-y: auto;
    padding: 20px;
    box-sizing: border-box;
  `,
    table: `
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #666;
  `,
    tableStyled: `
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #666;
    background: #22180f;
    border-radius: 10px;
    overflow: hidden;
  `,
    th: `
    border: 1px solid #666;
    padding: 8px;
    text-align: left;
    background: #333;
  `,
    td: `
    border: 1px solid #666;
    padding: 8px;
  `,
    statInfo: `
    display: flex;
    gap: 30px;
    margin-bottom: 20px;
    padding: 12px;
    background: rgba(34, 24, 15, 0.5);
    border-radius: 8px;
    border: 1px solid rgba(255, 215, 160, 0.1);
  `,
    statInfoItem: `
    font-size: 14px;
    color: #f5efe6;
  `
};

function applyStyles(element, styleString) {
    element.style.cssText = styleString;
}

function formatNumber(num) {
    return num.toLocaleString();
}

// ============================================================================
// UI
// ============================================================================

document.addEventListener('click', (e) => {
    const el = e.target.closest('img.frame');

    if (!el) return;

    showUI();
});

function showUI() {
    let box = document.getElementById('statvault-ui');

    if (!box) {
        box = Object.assign(document.createElement('div'), { id: 'statvault-ui' });
        applyStyles(box, styles.box);
        document.body.appendChild(box);
    }

    box.innerHTML = '';

    // HEADER
    const header = document.createElement('div');
    applyStyles(header, styles.header);

    const title = document.createElement('div');
    title.textContent = 'Stat Vault';
    applyStyles(title, styles.title);

    header.appendChild(title);

    // CONTENT
    const content = document.createElement('div');
    applyStyles(content, styles.content);

    // STAT INFO
    const statInfoContainer = document.createElement('div');
    applyStyles(statInfoContainer, styles.statInfo);

    const accAge = document.createElement('div');
    applyStyles(accAge, styles.statInfoItem);
    accAge.textContent = `Account Age = ${age} days`;

    const spage = document.createElement('div');
    applyStyles(spage, styles.statInfoItem);
    spage.textContent = `Stat Points/Age = ${(globalStats.sp / age).toFixed(2)}`;

    const stat1 = document.createElement('div');
    applyStyles(stat1, styles.statInfoItem);
    stat1.textContent = `Stat Points/Level = ${(globalStats.sp / globalStats.lvl).toFixed(2)}`;

    const stat2 = document.createElement('div');
    applyStyles(stat2, styles.statInfoItem);
    stat2.textContent = `Stats/Level = ${(statSum / globalStats.lvl).toFixed(2)}`;

    statInfoContainer.appendChild(accAge);
    statInfoContainer.appendChild(spage);
    statInfoContainer.appendChild(stat1);
    statInfoContainer.appendChild(stat2);
    content.appendChild(statInfoContainer);

    const highlights = genHighlights();
    const table = genTable();

    if (highlights) {
        highlights.style.marginBottom = '20px';
        applyStyles(highlights, styles.tableStyled);
    }

    if (table) {
        applyStyles(table, styles.tableStyled);
    }

    content.appendChild(highlights);
    content.appendChild(table);

    box.appendChild(header);
    box.appendChild(content);

    box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function genTable() {
    const table = document.createElement('table');
    applyStyles(table, styles.table);

    const headerRow = table.createTHead().insertRow();
    ['Date', 'Level', 'XP', 'Total SP', 'Raids Joined', 'Total Damage', 'Highest Hit'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        applyStyles(th, styles.th);
        headerRow.appendChild(th);
    });

    Object.entries(statStore)
        .sort(([a], [b]) => new Date(b) - new Date(a))
        .forEach(([date, stats]) => {
            const row = table.insertRow();
            [date, stats.lvl, stats.xp, stats.sp, stats.rc, stats.dmg, stats.dmgMax].forEach(value => {
                const td = row.insertCell();
                td.textContent = typeof value === 'number' ? formatNumber(value) : value;
                applyStyles(td, styles.td);
            });
        });

    return table;
}

function genHighlights() {
    const table = document.createElement('table');
    applyStyles(table, styles.table);

    const hr = table.createTHead().insertRow();
    ['Last', 'Levels', 'xp', 'Stats', 'Total Raids', 'Total Damage', 'Highest Hit'].forEach(t => {
        const th = document.createElement('th');
        th.textContent = t;
        applyStyles(th, styles.th);
        hr.appendChild(th);
    });

    let dmgMax = globalStats.dmgMax, dmgTotal = globalStats.dmg, totalRc = globalStats.rc;
    const today = new Date();

    let oldestData = globalStats;

    for (let i = 1; i <= 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);

        const stats = statStore[d.toISOString().slice(0, 10)] || {};

        if (Object.keys(stats).length > 0) {
            oldestData = stats;
        }

        dmgMax = Math.max(dmgMax, stats.dmgMax || 0);
        dmgTotal += stats.dmg || 0;
        totalRc += stats.rc || 0;

        if ([1, 7, 30].includes(i)) {
            const row = table.insertRow();
            [
                `${i}d`,
                globalStats.lvl - (stats.lvl ?? oldestData.lvl),
                globalStats.xp - (stats.xp ?? oldestData.xp),
                globalStats.sp - (stats.sp ?? oldestData.sp),
                i === 1 ? globalStats.rc : totalRc,
                i === 1 ? globalStats.dmg : dmgTotal,
                i === 1 ? globalStats.dmgMax : dmgMax
            ].forEach(v => {
                const td = row.insertCell();
                td.textContent = typeof v === 'number' ? formatNumber(v) : v;
                applyStyles(td, styles.td);
            });
        }
    }

    return table;
}

// logic
function updateLog() {
    const date = new Date().toISOString().slice(0, 10);

    const yesterday = new Date(`${date}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    if (!statStore[yesterdayKey]) {
        statStore[yesterdayKey] = { ...globalStats };
    }


    if (date !== currentDate) {
        currentDate = date;
        globalStats = {
            lvl: 0,
            rc: 0,
            sp: 0,
            xp: 0,
            dmg: 0,
            dmgMax: 0
        };
    }

    statStore[date] = globalStats;
    GM_setValue("statStore", statStore);
}

function attackHandler(data) {
    globalStats.dmg += data.damage.totalDamage;
    globalStats.dmgMax = Math.max(globalStats.dmgMax, data.damage.totalDamage);

    updateLog();
    console.log(`Damage recorded: ${data.damage.totalDamage}`);
}

function infoHandler(data) {
    age = Math.floor((Date.now() - new Date(1000 * data.payload.inventory.items["e.plain-farmers-tunic"].created).getTime()) / (1000 * 60 * 60 * 24));

    const stats = parseUserInfo(data.payload);
    globalStats.lvl = stats.lvl;
    globalStats.rc = stats.rc;
    globalStats.sp = stats.sp;
    globalStats.xp = stats.xp;

    updateLog();
    console.log(`Info updated: Level ${stats.lvl}, XP ${stats.xp}, SP ${stats.sp}, Raids Joined ${stats.rc}`);
}

function parseUserInfo(data) {
    statSum = 0;
    user = data.user;
    const out = {
        lvl: user.level,
        rc: user.counters.raidCount,
        sp: data.inventory.items["p.stats"].qty,
        xp: user.experience
    };

    out.sp += user.vitalitycap + user.energycap + user.honorcap - user.level;
    for (const stat of ["constitution", "strength", "agility", "intellect", "perception", "leadership"]) {
        statSum += user[stat];
        out.sp += statToSp(user[stat]);
    }
    return out;
}

function statToSp(value) {
    sp = 0;
    //<=10k
    if (value <= 10000) {
        return value;
    }
    //<=25k
    if (value <= 25000) {
        sp += 10000; // statToSp(10000)
        value -= 10000;
        inc = 1500;
        startCost = 2;
    }
    //>=25k
    else {
        sp += 107495; // statToSp(25000)
        value -= 25000;
        inc = 1000;
        startCost = 12;
    }

    const endCost = Math.floor(value / inc) + startCost - 1;
    const numIncrements = endCost - startCost + 1;

    //sum of arithmetic series * amount of stats per increment(1500 or 1000)
    sp += (numIncrements / 2) * (startCost + endCost) * inc;
    //remainder
    sp += (value % inc) * (endCost + 1);
    return sp;
}

// network interception

const open = XMLHttpRequest.prototype.open;
const send = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return open.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", () => {
        const path = new URL(this._url, location.origin).pathname;
        if (path === "/api/raid/attack") attackHandler(JSON.parse(this.responseText));
        if (path === "/api/user/info") infoHandler(JSON.parse(this.responseText));
    });

    return send.apply(this, arguments);
};