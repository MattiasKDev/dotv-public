// ==UserScript==
// @name         stat vault
// @namespace    https://github.com/MattiasKDev
// @author       infinity
// @description  Track player statistics including levels, XP, damage, and raid counts
// @version      2026.04.17
// @match        https://play.dragonsofthevoid.com/*
// @run-at       document-start
// @noframes
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_info
// @updateURL https://raw.githubusercontent.com/MattiasKDev/dotv-public/main/userscripts/statvault.user.js
// @downloadURL https://raw.githubusercontent.com/MattiasKDev/dotv-public/main/userscripts/statvault.user.js
// ==/UserScript==

console.log("stat vault loaded");
let statStore = GM_getValue("statStore", {});
let startTime = Date.now();
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
    box: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '75vw',
        height: '75vh',
        background: 'linear-gradient(180deg, #1f160f 0%, #1a120c 100%)',
        color: '#f5efe6',
        zIndex: '99999',
        padding: '0',
        boxSizing: 'border-box',
        overflow: 'hidden',
        border: '1px solid rgba(255, 215, 160, 0.14)',
        borderRadius: '18px',
        boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    },
    header: {
        position: 'sticky',
        top: '0',
        zIndex: '10',
        padding: '18px 22px',
        background: 'rgba(28, 20, 13, 0.96)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255, 215, 160, 0.12)'
    },
    title: {
        fontSize: '20px',
        fontWeight: '700',
        letterSpacing: '0.3px',
        color: '#f8e6c1'
    },
    content: {
        height: 'calc(100% - 72px)',
        overflowY: 'auto',
        padding: '20px 20px 88px',
        boxSizing: 'border-box'
    },
    topPanel: {},
    table: {
        width: '100%',
        borderCollapse: 'separate',
        borderSpacing: '0',
        border: '1px solid rgba(255, 215, 160, 0.14)',
        background: '#22180f',
        borderRadius: '12px',
        overflow: 'hidden'
    },
    tableStyled: {
        width: '100%',
        borderCollapse: 'separate',
        borderSpacing: '0',
        border: '1px solid rgba(255, 215, 160, 0.14)',
        background: '#22180f',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)'
    },
    th: {
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(255, 215, 160, 0.14)',
        padding: '12px 10px',
        textAlign: 'right',
        background: 'linear-gradient(180deg, #3a3a3a 0%, #2f2f2f 100%)',
        color: '#f3eadb',
        fontSize: '13px',
        fontWeight: '700',
        whiteSpace: 'nowrap'
    },
    thLeft: {
        textAlign: 'left'
    },
    td: {
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '12px 10px',
        color: '#f5efe6',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums'
    },
    tdLeft: {
        textAlign: 'left'
    },
    rowEven: {
        background: 'rgba(255,255,255,0.025)'
    },
    rowOdd: {
        background: 'rgba(0,0,0,0.10)'
    },
    statInfo: {
        display: 'flex',
        gap: '28px',
        marginBottom: '20px',
        padding: '14px 16px',
        background: 'rgba(34, 24, 15, 0.58)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 215, 160, 0.10)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)'
    },
    statInfoItem: {
        fontSize: '14px',
        color: '#f5efe6',
        fontWeight: '500',
        whiteSpace: 'nowrap'
    },
    footer: {
        position: 'absolute',
        left: '0',
        right: '0',
        bottom: '0',
        zIndex: '10',
        padding: '14px 20px',
        background: 'rgba(28, 20, 13, 0.96)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(255, 215, 160, 0.12)'
    },
    metaInfoRight: {
        display: 'flex',
        gap: '28px'
    },
    metaInfo: {
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        fontSize: '12px',
        marginTop: '2px',
        color: 'rgba(255, 220, 170, 0.68)',
        fontWeight: '600'
    },
    highlightsGap: {
        marginBottom: '28px'
    }
};

function applyStyles(element, styleObject) {
    Object.assign(element.style, styleObject);
}

function formatNumber(num) {
    return num.toLocaleString();
}

function formatElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));

    const days = Math.floor(totalSec / 86400);
    if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;

    const hours = Math.floor(totalSec / 3600);
    if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;

    const minutes = Math.floor(totalSec / 60);
    if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

    return `${totalSec} second${totalSec === 1 ? "" : "s"}`;
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

    // TOP PANEL
    const topPanel = document.createElement('div');
    applyStyles(topPanel, styles.topPanel);

    // MAIN STAT INFO ROW
    const statInfoContainer = document.createElement('div');
    applyStyles(statInfoContainer, styles.statInfo);
    const accAge = document.createElement('div');
    applyStyles(accAge, styles.statInfoItem);
    accAge.innerHTML = `<span style="opacity:0.6">Account Age</span> = <span style="font-weight:600">${age} days</span>`;

    const spage = document.createElement('div');
    applyStyles(spage, styles.statInfoItem);
    spage.innerHTML = `<span style="opacity:0.6">Stat Points/Age</span> = <span style="font-weight:600">${(globalStats.sp / age).toFixed(2)}</span>`;

    const splvl = document.createElement('div');
    applyStyles(splvl, styles.statInfoItem);
    splvl.innerHTML = `<span style="opacity:0.6">Stat Points/Level</span> = <span style="font-weight:600">${(globalStats.sp / globalStats.lvl).toFixed(2)}</span>`;

    const statlvl = document.createElement('div');
    applyStyles(statlvl, styles.statInfoItem);
    statlvl.innerHTML = `<span style="opacity:0.6">Stats/Level</span> = <span style="font-weight:600">${(statSum / globalStats.lvl).toFixed(2)}</span>`;

    statInfoContainer.appendChild(accAge);
    statInfoContainer.appendChild(spage);
    statInfoContainer.appendChild(splvl);
    statInfoContainer.appendChild(statlvl);

    // META INFO ROW
    const metaInfoContainer = document.createElement('div');
    applyStyles(metaInfoContainer, Object.assign({}, styles.footer, styles.metaInfo));

    const metaRight = document.createElement('div');
    applyStyles(metaRight, styles.metaInfoRight);

    const lastUpdated = document.createElement('div');
    lastUpdated.textContent = `Last updated ${getLastUpdatedText()} ago`;

    const resetTimer = document.createElement('div');
    resetTimer.textContent = `Daily reset in ${getResetCountdownText()}`;

    const version = document.createElement('div');
    version.textContent = `v${GM_info?.script?.version || 'dev'}`;

    metaRight.appendChild(lastUpdated);
    metaRight.appendChild(resetTimer);
    metaRight.appendChild(version);

    metaInfoContainer.appendChild(metaRight);

    topPanel.appendChild(statInfoContainer);

    content.appendChild(topPanel);

    // TABLE SECTIONS
    const highlights = genHighlights();
    const table = genTable();

    if (highlights) {
        applyStyles(highlights, Object.assign({}, styles.tableStyled, styles.highlightsGap));
        content.appendChild(highlights);
    }

    if (table) {
        applyStyles(table, styles.tableStyled);
        content.appendChild(table);
    }

    box.appendChild(header);
    box.appendChild(content);
    box.appendChild(metaInfoContainer);

    box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function genTable() {
    const table = document.createElement('table');
    applyStyles(table, styles.table);

    const columns = [
        { key: 'date', label: 'Date' },
        { key: 'lvl', label: 'Level' },
        { key: 'xp', label: 'XP' },
        { key: 'sp', label: 'Total SP' },
        { key: 'spGain', label: 'SP Gain' },
        { key: 'rc', label: 'Raids' },
        { key: 'dmg', label: 'Total Damage' },
        { key: 'dmgMax', label: 'Highest Hit' },
        { key: 'spLvl', label: 'SP/Level' }
    ];

    const thead = table.createTHead();
    const headerRow = thead.insertRow();

    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        applyStyles(th, col.key === 'date' ? Object.assign({}, styles.th, styles.thLeft) : styles.th);
        headerRow.appendChild(th);
    });

    const sortedEntries = Object.entries(statStore)
        .sort(([a], [b]) => new Date(b) - new Date(a));

    sortedEntries.forEach(([date, stats], i) => {
        const prevStats = sortedEntries[i + 1]?.[1] || null;

        const rowData = {
            date,
            lvl: stats.lvl,
            xp: stats.xp,
            sp: stats.sp,
            spGain: prevStats ? stats.sp - prevStats.sp : 0,
            rc: stats.rc,
            dmg: stats.dmg,
            dmgMax: stats.dmgMax,
            spLvl: stats.lvl > 0 ? (stats.sp / stats.lvl).toFixed(2) : 0
        };

        const row = table.insertRow();

        applyStyles(row, i % 2 === 0 ? styles.rowEven : styles.rowOdd);

        columns.forEach(col => {
            const td = row.insertCell();
            const value = rowData[col.key];

            td.textContent = typeof value === 'number' ? formatNumber(value) : value;
            applyStyles(td, col.key === 'date' ? Object.assign({}, styles.td, styles.tdLeft) : styles.td);
        });
    });

    return table;
}

function genHighlights() {
    const table = document.createElement('table');
    applyStyles(table, styles.table);

    const hr = table.createTHead().insertRow();
    ['Last', 'Levels', 'XP', 'Stats', 'Total Raids', 'Total Damage', 'Highest Hit'].forEach((t, index) => {
        const th = document.createElement('th');
        th.textContent = t;
        applyStyles(th, index === 0 ? Object.assign({}, styles.th, styles.thLeft) : styles.th);
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
            ].forEach((v, index) => {
                const td = row.insertCell();
                td.textContent = typeof v === 'number' ? formatNumber(v) : v;
                applyStyles(td, index === 0 ? Object.assign({}, styles.td, styles.tdLeft) : styles.td);
            });
        }
    }

    return table;
}

// logic
function getLastUpdatedText() {
    return elapsedText = formatElapsed(Date.now() - startTime);
}
function getResetCountdownText() {
    let now = new Date();
    let nextDay = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );
    let timeUntilNextDay = nextDay - now;

    return formatElapsed(timeUntilNextDay);
}

function updateLog() {
    const date = new Date().toISOString().slice(0, 10);

    const yesterday = new Date(`${date}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    if (!statStore[yesterdayKey]) {
        statStore[yesterdayKey] = { ...globalStats };
        statStore[yesterdayKey].rc = 0;
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


const realFetch = unsafeWindow.fetch;
unsafeWindow.fetch = function (...args) {
    const urlInput = typeof args[0] === "string" ? args[0] : args[0]?.url;

    return realFetch.apply(this, args).then((response) => {
        try {
            const path = new URL(urlInput, location.origin).pathname;
            if (path === "/api/raid/attack" || path === "/api/user/info") {
                response.clone().json().then((data) => {
                    if (path === "/api/raid/attack") attackHandler(data);
                    if (path === "/api/user/info") infoHandler(data);
                }).catch(() => {
                    // Ignore non-JSON or empty responses.
                });
            }
        } catch (_e) {
            // Ignore invalid URLs and keep fetch behavior unchanged.
        }

        return response;
    });
};