// ==UserScript==
// @name         stat vault
// @namespace    https://github.com/MattiasKDev
// @author       infinity
// @description  Track player statistics including levels, XP, damage, and raid counts
// @version      2026.04.25
// @match        https://play.dragonsofthevoid.com/*
// @run-at       document-start
// @noframes
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_info
// @supportURL https://github.com/MattiasKDev/dotv-public#support
// @updateURL https://raw.githubusercontent.com/MattiasKDev/dotv-public/main/userscripts/statvault.user.js
// @downloadURL https://raw.githubusercontent.com/MattiasKDev/dotv-public/main/userscripts/statvault.user.js
// ==/UserScript==

console.log("[statvault] stat vault loaded");

const STATVAULT_SYNC_API_URL = "https://statvault-sync.mattias-cb7.workers.dev/sync";
const STATVAULT_SUPPORT_URL = "https://github.com/MattiasKDev/dotv-public#support";
const STATVAULT_LEADERBOARD_API_URL = STATVAULT_SYNC_API_URL
    ? STATVAULT_SYNC_API_URL.replace(/\/sync$/, "/leaderboards")
    : "";

// ============================================================================
// STYLES
// ============================================================================

const STATVAULT_UI_STYLE_ID = "statvault-ui-style";
const STATVAULT_UI_CSS = `
.sv-box {
    --sv-chrome-bg: linear-gradient(180deg, rgba(37, 26, 18, 0.98) 0%, rgba(28, 20, 13, 0.96) 100%);
    --sv-content-bg: linear-gradient(180deg, rgba(26, 18, 12, 0.92) 0%, rgba(22, 15, 10, 0.96) 100%);
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 75vw;
    height: 75vh;
    background: linear-gradient(180deg, #1f160f 0%, #1a120c 100%);
    color: #f5efe6;
    z-index: 99999;
    padding: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid rgba(255, 215, 160, 0.14);
    border-radius: 18px;
    box-shadow: 0 24px 70px rgba(0,0,0,0.55);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex;
    flex-direction: column;
}

.sv-header {
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 14px 20px;
    background: var(--sv-chrome-bg);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 215, 160, 0.12);
}

.sv-header-main {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-right: 42px;
}

.sv-title {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: #f8e6c1;
    text-align: left;
    white-space: nowrap;
}

.sv-content {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 20px;
    box-sizing: border-box;
    background: var(--sv-content-bg);
}

.sv-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid rgba(255, 215, 160, 0.14);
    background: #22180f;
    border-radius: 12px;
    overflow: hidden;
}

.sv-table-styled {
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
}

.sv-highlights-gap {
    margin-bottom: 28px;
}

.sv-view-tabs,
.sv-leaderboard-group-tabs,
.sv-leaderboard-board-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 4px;
}

.sv-view-tabs::-webkit-scrollbar,
.sv-leaderboard-group-tabs::-webkit-scrollbar,
.sv-leaderboard-board-tabs::-webkit-scrollbar {
    height: 6px;
}

.sv-view-tabs::-webkit-scrollbar-thumb,
.sv-leaderboard-group-tabs::-webkit-scrollbar-thumb,
.sv-leaderboard-board-tabs::-webkit-scrollbar-thumb {
    background: rgba(255, 215, 160, 0.18);
    border-radius: 999px;
}

.sv-view-tabs {
    justify-content: flex-start;
    margin-bottom: 0;
    width: auto;
    flex: 0 1 auto;
}

.sv-view-tabs .sv-tab-button {
    padding: 11px 18px;
    font-size: 13px;
}

.sv-tab-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 215, 160, 0.16);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(246, 238, 226, 0.82);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    flex: 0 0 auto;
}

.sv-tab-button:hover {
    background: rgba(255, 255, 255, 0.065);
}

.sv-tab-button-active {
    border-color: rgba(255, 215, 160, 0.3);
    background: linear-gradient(180deg, #4c3522 0%, #3d2b1c 100%);
    color: #f8e6c1;
    box-shadow: 0 8px 22px rgba(0,0,0,0.22);
}

.sv-leaderboard-shell {
    --sv-leaderboard-sidebar-width: 180px;
    --sv-leaderboard-shell-gap: 20px;
    display: grid;
    grid-template-columns: var(--sv-leaderboard-sidebar-width) minmax(0, 1fr);
    gap: var(--sv-leaderboard-shell-gap);
    align-items: start;
}

.sv-leaderboard-sidebar {
    display: flex;
    flex-direction: column;
}

.sv-leaderboard-main {
    min-width: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
}

.sv-leaderboard-stage {
    width: 100%;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.sv-leaderboard-table-stage {
    display: inline-flex;
    justify-content: center;
    max-width: 100%;
    padding: 18px 20px;
    border-radius: 16px;
    border: 1px solid rgba(255, 215, 160, 0.10);
    background: rgba(34, 24, 15, 0.62);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
}

.sv-leaderboard-group-tabs {
    flex-direction: column;
    overflow-x: visible;
    overflow-y: auto;
    padding-bottom: 0;
    margin-bottom: 0;
}

.sv-leaderboard-group-tabs .sv-tab-button {
    width: 100%;
    justify-content: flex-start;
    border-radius: 14px;
    padding: 14px 16px;
    font-size: 15px;
}

.sv-leaderboard-board-tabs {
    justify-content: center;
    gap: 10px;
}

.sv-leaderboard-board-tabs .sv-tab-button {
    padding: 11px 18px;
    font-size: 14px;
}

.sv-leaderboard-board {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.sv-leaderboard-status {
    padding: 16px 18px;
    border-radius: 12px;
    border: 1px solid rgba(255, 215, 160, 0.10);
    background: rgba(34, 24, 15, 0.58);
    color: #f5efe6;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
}

.sv-rank-cell {
    width: 56px;
}

.sv-viewer-separator {
    height: 10px;
    background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,215,160,0.06) 100%);
}

.sv-viewer-separator .sv-td {
    padding: 0;
    border-right: 0;
    border-bottom: 0;
    height: 10px;
}

.sv-row-viewer {
    background: linear-gradient(180deg, rgba(117, 83, 38, 0.55) 0%, rgba(82, 58, 27, 0.6) 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}

.sv-row-viewer .sv-td {
    border-bottom-color: rgba(255, 215, 160, 0.2);
}

.sv-table-leaderboard {
    width: auto;
    min-width: 360px;
    margin: 0 auto;
    border: 0;
    background: transparent;
    border-radius: 0;
    overflow: visible;
    box-shadow: none;
    table-layout: auto;
}

.sv-table-leaderboard .sv-td {
    border-right: 0;
    border-bottom: 0;
    background: transparent;
    padding: 9px 12px;
}

.sv-table-leaderboard .sv-row-even,
.sv-table-leaderboard .sv-row-odd {
    background: transparent;
}

.sv-table-leaderboard .sv-row-viewer {
    background: linear-gradient(180deg, rgba(117, 83, 38, 0.55) 0%, rgba(82, 58, 27, 0.6) 100%);
}

.sv-table-leaderboard .sv-rank-cell,
.sv-table-leaderboard .sv-td-rank {
    width: 44px;
    min-width: 44px;
    text-align: right;
}

.sv-table-leaderboard .sv-td-center {
    text-align: center;
}

.sv-table-leaderboard .sv-td-right {
    text-align: right;
}

.sv-table-leaderboard .sv-td-name {
    min-width: 150px;
}

.sv-table-leaderboard .sv-td-class {
    min-width: 120px;
}

.sv-table-leaderboard .sv-td-value,
.sv-table-leaderboard .sv-td-date {
    min-width: 110px;
}

.sv-th {
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 215, 160, 0.14);
    padding: 12px 10px;
    text-align: right;
    background: linear-gradient(180deg, #3a3a3a 0%, #2f2f2f 100%);
    color: #f3eadb;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
}

.sv-th-left {
    text-align: left;
}

.sv-td {
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 12px 10px;
    color: #f5efe6;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.sv-td-left {
    text-align: left;
}

.sv-row-even {
    background: rgba(255,255,255,0.025);
}

.sv-row-odd {
    background: rgba(0,0,0,0.10);
}

.sv-stat-info {
    display: flex;
    gap: 28px;
    margin-bottom: 20px;
    padding: 14px 16px;
    background: rgba(34, 24, 15, 0.58);
    border-radius: 12px;
    border: 1px solid rgba(255, 215, 160, 0.10);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
}

.sv-stat-info-item {
    font-size: 14px;
    color: #f5efe6;
    font-weight: 500;
    white-space: nowrap;
}

.sv-stat-label {
    opacity: 0.6;
}

.sv-stat-value {
    font-weight: 600;
}

.sv-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 14px 20px;
    background: var(--sv-chrome-bg);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(255, 215, 160, 0.12);
}

.sv-footer::-webkit-scrollbar {
    height: 6px;
}

.sv-footer::-webkit-scrollbar-thumb {
    background: rgba(255, 215, 160, 0.18);
    border-radius: 999px;
}

.sv-footer-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
}

.sv-footer-group-right {
    justify-content: flex-end;
    margin-left: auto;
}

.sv-meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 215, 160, 0.12);
    background: rgba(255, 255, 255, 0.035);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
    white-space: nowrap;
    flex: 0 0 auto;
}

.sv-meta-chip-label {
    color: rgba(255, 220, 170, 0.58);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.sv-meta-chip-value {
    color: #f6eee2;
    font-size: 11px;
    font-weight: 700;
}

.sv-meta-chip-sync-ok {
    border-color: rgba(140, 210, 160, 0.24);
    background: rgba(60, 116, 72, 0.16);
}

.sv-meta-chip-sync-pending {
    border-color: rgba(255, 215, 160, 0.24);
    background: rgba(110, 82, 38, 0.18);
}

.sv-meta-chip-sync-error {
    border-color: rgba(255, 126, 126, 0.26);
    background: rgba(123, 31, 31, 0.18);
}

.sv-meta-chip-sync-off {
    border-color: rgba(170, 170, 170, 0.18);
    background: rgba(255, 255, 255, 0.025);
}

.sv-meta-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 215, 160, 0.22);
    background: linear-gradient(180deg, #4c3522 0%, #3d2b1c 100%);
    color: #f8e6c1;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(0,0,0,0.18);
    white-space: nowrap;
    flex: 0 0 auto;
}

.sv-meta-button:hover {
    background: linear-gradient(180deg, #5a3f29 0%, #473120 100%);
}

.sv-meta-button:active {
    transform: translateY(1px);
}

@media (max-width: 1440px) {
    .sv-box {
        width: 88vw;
    }
}

@media (max-width: 1100px) {
    .sv-header-main {
        gap: 10px;
        padding-right: 42px;
    }

    .sv-leaderboard-shell {
        width: 100%;
        grid-template-columns: 1fr;
    }

    .sv-leaderboard-group-tabs {
        flex-direction: row;
        overflow-x: auto;
        overflow-y: hidden;
    }

    .sv-leaderboard-group-tabs .sv-tab-button {
        width: auto;
        justify-content: center;
        border-radius: 999px;
    }

}

.sv-entry-button {
    position: absolute;
    top: 28px;
    left: 28px;
    z-index: 15;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 215, 160, 0.28);
    background: linear-gradient(180deg, #4c3522 0%, #3d2b1c 100%);
    color: #f8e6c1;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(0,0,0,0.28);
}

.sv-close-button {
    position: absolute;
    top: 12px;
    right: 14px;
    width: 28px;
    height: 28px;
    border: 1px solid rgba(255, 126, 126, 0.55);
    border-radius: 8px;
    background: linear-gradient(180deg, #9f2f2f 0%, #7b1f1f 100%);
    color: #ffeaea;
    font-size: 15px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    padding: 0;
}
`;

function ensureStatVaultUIStyles() {
    if (document.getElementById(STATVAULT_UI_STYLE_ID)) return;

    if (!document.head) {
        window.addEventListener("DOMContentLoaded", ensureStatVaultUIStyles, { once: true });
        return;
    }

    const styleEl = document.createElement("style");
    styleEl.id = STATVAULT_UI_STYLE_ID;
    styleEl.textContent = STATVAULT_UI_CSS;
    document.head.appendChild(styleEl);
}

class StatVaultCore {
    constructor() {
        this.startTime = Date.now();
        this.currentDate = new Date().toISOString().slice(0, 10);
        this.activeStorageUserId = "";
        this.statStore = {};
        this.globalStats = this.createEmptyStatRow();

        this.statSum = 0;
        this.age = 0;
        this.userProfile = {
            id: "",
            characterName: "",
            accountCreatedAt: null,
        };
        this.lastSyncedAt = null;
        this.hasPendingChanges = false;
        this.lastSyncError = null;
        this.syncInFlight = null;
        this.leaderboardCache = {};
        this.leaderboardRequests = {};
    }

    createEmptyStatRow() {
        return {
            lvl: 0,
            rc: 0,
            sp: 0,
            xp: 0,
            dmg: 0,
            dmgMax: 0,
        };
    }

    createStatSnapshot(stats = {}) {
        const row = this.normalizeStoredStatRow(stats);

        return {
            lvl: row.lvl,
            rc: row.rc,
            sp: row.sp,
            xp: row.xp,
            dmg: row.dmg,
            dmgMax: row.dmgMax,
        };
    }

    getScopedStatStoreKey(userId) {
        return `statStore:${userId}`;
    }

    getScopedLastSyncedAtKey(userId) {
        return `lastSyncedAt:${userId}`;
    }

    persistScopedStorage() {
        if (!this.activeStorageUserId) return;

        GM_setValue(this.getScopedStatStoreKey(this.activeStorageUserId), this.statStore);
        GM_setValue(this.getScopedLastSyncedAtKey(this.activeStorageUserId), this.lastSyncedAt);
    }

    loadScopedStorage(userId) {
        const scopedStore = GM_getValue(this.getScopedStatStoreKey(userId), {});

        this.statStore = scopedStore && typeof scopedStore === "object" ? scopedStore : {};
        this.globalStats = this.createStatSnapshot(this.statStore[this.currentDate]);
        this.lastSyncedAt = GM_getValue(this.getScopedLastSyncedAtKey(userId), null);
        this.hasPendingChanges = false;
        this.lastSyncError = null;
        this.leaderboardCache = {};
        this.leaderboardRequests = {};
        this.activeStorageUserId = userId;
    }

    activateUserStorage(userId) {
        const nextUserId = String(userId ?? "").trim();
        if (!nextUserId || this.activeStorageUserId === nextUserId) {
            return;
        }

        this.persistScopedStorage();
        this.loadScopedStorage(nextUserId);
    }

    formatNumber(num) {
        return num.toLocaleString();
    }

    formatElapsed(ms) {
        const totalSec = Math.max(0, Math.floor(ms / 1000));

        const days = Math.floor(totalSec / 86400);
        if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;

        const hours = Math.floor(totalSec / 3600);
        if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;

        const minutes = Math.floor(totalSec / 60);
        if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

        return `${totalSec} second${totalSec === 1 ? "" : "s"}`;
    }

    getAllTimeHighestHit() {
        let highestHit = this.globalStats.dmgMax || 0;

        for (const stats of Object.values(this.statStore)) {
            highestHit = Math.max(highestHit, stats?.dmgMax || 0);
        }

        return highestHit;
    }

    getLastUpdatedText() {
        return this.formatElapsed(Date.now() - this.startTime);
    }

    getResetCountdownText() {
        const now = new Date();
        const nextDay = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
        );
        const timeUntilNextDay = nextDay - now;

        return this.formatElapsed(timeUntilNextDay);
    }

    isRemoteSyncEnabled() {
        return Boolean(STATVAULT_SYNC_API_URL);
    }

    isLeaderboardEnabled() {
        return Boolean(STATVAULT_LEADERBOARD_API_URL);
    }

    getRequestFetch() {
        return typeof unsafeWindow !== "undefined" && unsafeWindow.fetch
            ? unsafeWindow.fetch.bind(unsafeWindow)
            : fetch;
    }

    markPendingChanges() {
        if (!this.isRemoteSyncEnabled()) return;

        this.hasPendingChanges = true;
    }

    recordSyncSuccess() {
        this.lastSyncedAt = new Date().toISOString();
        this.hasPendingChanges = false;
        this.lastSyncError = null;
        this.persistScopedStorage();
    }

    recordSyncFailure(error) {
        this.lastSyncError = error instanceof Error ? error.message : String(error);
    }

    getLastSyncedText() {
        if (!this.isRemoteSyncEnabled()) {
            return "Sync off";
        }

        if (!this.lastSyncedAt) {
            return "Never";
        }

        const elapsed = Date.now() - new Date(this.lastSyncedAt).getTime();
        if (Number.isNaN(elapsed)) {
            return "Unknown";
        }

        return `${this.formatElapsed(elapsed)} ago`;
    }

    getSyncStatus() {
        if (!this.isRemoteSyncEnabled()) {
            return {
                value: "Remote sync disabled",
                tone: "off",
            };
        }

        if (this.syncInFlight) {
            return {
                value: "Syncing now",
                tone: "pending",
            };
        }

        if (this.lastSyncError) {
            return {
                value: this.hasPendingChanges ? "Sync failed, retry on reload" : "Last sync failed",
                tone: "error",
            };
        }

        if (this.hasPendingChanges) {
            return {
                value: "Local changes pending",
                tone: "pending",
            };
        }

        return {
            value: "All changes synced",
            tone: "ok",
        };
    }

    updateLog({ markPendingChanges = true } = {}) {
        const date = new Date().toISOString().slice(0, 10);

        const yesterday = new Date(`${date}T00:00:00.000Z`);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayKey = yesterday.toISOString().slice(0, 10);

        if (!this.statStore[yesterdayKey]) {
            this.statStore[yesterdayKey] = {
                lvl: this.globalStats.lvl ?? 0,
                rc: 0,
                sp: this.globalStats.sp ?? 0,
                xp: this.globalStats.xp ?? 0,
                dmg: 0,
                dmgMax: 0,
                syntheticBaseline: true,
            };
        }

        if (date !== this.currentDate) {
            const prevStats = this.globalStats;
            this.currentDate = date;
            this.globalStats = {
                lvl: prevStats.lvl ?? 0,
                rc: 0,
                sp: prevStats.sp ?? 0,
                xp: prevStats.xp ?? 0,
                dmg: 0,
                dmgMax: 0,
            };
        }

        this.statStore[date] = this.globalStats;
        if (markPendingChanges) {
            this.markPendingChanges();
        }
        this.persistScopedStorage();
    }

    attackHandler(data) {
        this.globalStats.dmg += data.damage.totalDamage;
        this.globalStats.dmgMax = Math.max(this.globalStats.dmgMax, data.damage.totalDamage);
        this.updateLog();
        console.log(`[statvault] Damage recorded: ${data.damage.totalDamage}`);
    }

    infoHandler(data) {
        this.age = Math.floor(
            (Date.now() - new Date(data.payload.user.create_dttm).getTime()) / (1000 * 60 * 60 * 24)
        );
        this.userProfile.id = String(data.payload.user.id ?? "");
        this.userProfile.characterName = String(data.payload.user.characterName ?? "");
        this.userProfile.accountCreatedAt = this.normalizeDateTime(data.payload.user.create_dttm);
        this.activateUserStorage(this.userProfile.id);

        const stats = this.parseUserInfo(data.payload);
        this.globalStats.lvl = stats.lvl;
        this.globalStats.rc = stats.rc;
        this.globalStats.sp = stats.sp;
        this.globalStats.xp = stats.xp;
        this.updateLog();
        void this.syncWithRemote(data.payload);
        console.log(`[statvault] Info updated: Level ${stats.lvl}, XP ${stats.xp}, SP ${stats.sp}, Raids Joined ${stats.rc}`);
    }

    raidJoinHandler(data) {
        if (data.error) return;
        this.globalStats.rc += 1;
        this.updateLog();
        console.log("[statvault] Raid join recorded");
    }

    parseUserInfo(data) {
        this.statSum = 0;
        const user = data.user;
        const out = {
            lvl: user.level,
            rc: user.counters.raidCount,
            sp: data.inventory.items["p.stats"].qty,
            xp: user.experience,
        };

        out.sp += user.vitalitycap + user.energycap + user.honorcap - user.level;
        for (const stat of ["constitution", "strength", "agility", "intellect", "perception", "leadership"]) {
            this.statSum += user[stat];
            const statPoints = this.statToSp(user[stat]);
            out.sp += statPoints;
            console.log(`[statvault] ${stat}: ${user[stat]} (SP: ${statPoints})`);
        }

        return out;
    }

    findBanners(inventoryItems) {
        const lvlTiers = [10, 100, 500, 1000, 2000, 3000, 4000, 5000, 6000];
        let classFromBanners = [];
        for (const key in inventoryItems) {
            if (key.startsWith("ba.")) {
                let stripped = key.slice(3); // remove 'ba.'
                if (stripped.endsWith("-banner")) {
                    stripped = stripped.slice(0, -7);
                }
                if (stripped.includes("-")) {
                    stripped = stripped.replace(/-/g, " ");
                }
                classFromBanners.push({
                    className: stripped,
                    createdAt: inventoryItems[key].created,
                });
            }
        }

        classFromBanners.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

        classFromBanners = classFromBanners.map((banner, idx) => ({
            ...banner,
            lvlTier: lvlTiers[idx] ?? null
        }));
        console.log("[statvault] Banners found in inventory:", classFromBanners);
        const limitedBanners = classFromBanners.slice(0, 4);
        console.log("[statvault] Class from banners:", limitedBanners);
        return limitedBanners;
    }

    normalizeDateTime(value) {
        if (!value) return null;

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date.toISOString();
    }

    normalizeBannerReachedAt(value) {
        const reachedAtMs = Number(value) * 1000;
        if (!Number.isFinite(reachedAtMs)) {
            return null;
        }

        const date = new Date(reachedAtMs);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return date.toISOString();
    }

    maxStatValue(a, b) {
        return Math.max(Number(a) || 0, Number(b) || 0);
    }

    normalizeStoredStatRow(stats = {}) {
        return {
            lvl: Number(stats.lvl) || 0,
            rc: Number(stats.rc) || 0,
            sp: Number(stats.sp) || 0,
            xp: Number(stats.xp) || 0,
            dmg: Number(stats.dmg) || 0,
            dmgMax: Number(stats.dmgMax) || 0,
            syntheticBaseline: Boolean(stats.syntheticBaseline),
        };
    }

    mergeStatRow(baseStats, incomingStats) {
        const base = this.normalizeStoredStatRow(baseStats);
        const incoming = this.normalizeStoredStatRow(incomingStats);

        if (base.syntheticBaseline && !incoming.syntheticBaseline) {
            return {
                lvl: incoming.lvl,
                rc: incoming.rc,
                sp: incoming.sp,
                xp: incoming.xp,
                dmg: incoming.dmg,
                dmgMax: incoming.dmgMax,
            };
        }

        if (!base.syntheticBaseline && incoming.syntheticBaseline) {
            return {
                lvl: base.lvl,
                rc: base.rc,
                sp: base.sp,
                xp: base.xp,
                dmg: base.dmg,
                dmgMax: base.dmgMax,
            };
        }

        return {
            lvl: this.maxStatValue(base.lvl, incoming.lvl),
            rc: this.maxStatValue(base.rc, incoming.rc),
            sp: this.maxStatValue(base.sp, incoming.sp),
            xp: this.maxStatValue(base.xp, incoming.xp),
            dmg: this.maxStatValue(base.dmg, incoming.dmg),
            dmgMax: this.maxStatValue(base.dmgMax, incoming.dmgMax),
            syntheticBaseline: base.syntheticBaseline && incoming.syntheticBaseline,
        };
    }

    buildSyncPayload(payload) {
        const classMilestones = this.findBanners(payload.inventory.items)
            .map((banner) => ({
                classLevel: Number(banner.lvlTier) || 0,
                className: String(banner.className ?? "").trim(),
                earnedAt: this.normalizeBannerReachedAt(banner.createdAt),
            }))
            .filter((banner) => banner.classLevel > 0 && banner.className && banner.earnedAt);


        const dailyStats = Object.entries(this.statStore)
            .filter(([, stats]) => !stats?.syntheticBaseline)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, stats]) => {
                const row = this.normalizeStoredStatRow(stats);

                return {
                    date,
                    lvl: row.lvl,
                    xp: row.xp,
                    sp: row.sp,
                    rc: row.rc,
                    dmg: row.dmg,
                    dmgMax: row.dmgMax,
                };
            });

        return {
            user: {
                id: this.userProfile.id,
                characterName: this.userProfile.characterName,
                accountCreatedAt: this.userProfile.accountCreatedAt,
            },
            currentStats: {
                lvl: this.globalStats.lvl || 0,
                xp: this.globalStats.xp || 0,
                sp: this.globalStats.sp || 0,
            },
            dailyStats,
            classMilestones,
        };
    }

    mergeRemoteSyncData(syncData) {
        if (!syncData?.ok) return;

        for (const row of syncData.dailyStats || []) {
            if (!row?.date) continue;

            const existingRow = this.statStore[row.date];
            this.statStore[row.date] = this.mergeStatRow(existingRow, row);
        }

        if (syncData.currentStats) {
            const todayStats = this.statStore[this.currentDate] || this.globalStats;
            this.globalStats = this.createStatSnapshot(this.mergeStatRow(todayStats, syncData.currentStats));
            this.statStore[this.currentDate] = this.globalStats;
        } else if (this.statStore[this.currentDate]) {
            this.globalStats = this.createStatSnapshot(this.mergeStatRow(this.globalStats, this.statStore[this.currentDate]));
            this.statStore[this.currentDate] = this.globalStats;
        }

        this.persistScopedStorage();
    }

    getCachedLeaderboardGroup(group) {
        const cachedEntry = this.leaderboardCache[group];
        if (!cachedEntry) {
            return null;
        }

        const viewerId = this.userProfile.id || "";
        if (cachedEntry.viewerId !== viewerId) {
            return null;
        }

        return cachedEntry.data;
    }

    isLeaderboardGroupLoading(group) {
        return Boolean(this.leaderboardRequests[group]);
    }

    async fetchLeaderboardGroup(group) {
        if (!STATVAULT_LEADERBOARD_API_URL) {
            throw new Error("Leaderboards are unavailable");
        }

        const cached = this.getCachedLeaderboardGroup(group);
        if (cached) {
            return cached;
        }

        if (this.leaderboardRequests[group]) {
            return this.leaderboardRequests[group];
        }

        const viewerId = this.userProfile.id || "";
        const url = new URL(STATVAULT_LEADERBOARD_API_URL);
        url.searchParams.set("group", group);
        if (viewerId) {
            url.searchParams.set("viewerId", viewerId);
        }

        this.leaderboardRequests[group] = (async () => {
            try {
                const response = await this.getRequestFetch()(url.toString(), {
                    method: "GET",
                    mode: "cors",
                    credentials: "omit",
                });

                if (!response.ok) {
                    throw new Error(`Leaderboard request failed with status ${response.status}`);
                }

                const data = await response.json();
                this.leaderboardCache[group] = {
                    viewerId,
                    data,
                };

                return data;
            } finally {
                delete this.leaderboardRequests[group];
            }
        })();

        return this.leaderboardRequests[group];
    }

    async syncWithRemote(payload) {
        if (!STATVAULT_SYNC_API_URL || !this.userProfile.id) {
            return;
        }

        if (this.syncInFlight) {
            return this.syncInFlight;
        }

        const syncPayload = this.buildSyncPayload(payload);
        const syncUserId = syncPayload.user.id;

        this.syncInFlight = (async () => {
            try {
                const response = await this.getRequestFetch()(STATVAULT_SYNC_API_URL, {
                    method: "POST",
                    mode: "cors",
                    credentials: "omit",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(syncPayload),
                });

                if (!response.ok) {
                    throw new Error(`Sync failed with status ${response.status}`);
                }

                const syncData = await response.json();
                if (this.activeStorageUserId !== syncUserId || this.userProfile.id !== syncUserId) {
                    return;
                }
                this.mergeRemoteSyncData(syncData);
                this.recordSyncSuccess();
                console.log("[statvault] Remote sync complete");
            } catch (error) {
                this.recordSyncFailure(error);
                console.error("[statvault] Remote sync failed", error);
            } finally {
                this.syncInFlight = null;
            }
        })();

        return this.syncInFlight;
    }

    statToSp(value) {
        let sp = 0;

        // <=10k
        if (value <= 10000) {
            return value;
        }

        let inc;
        let startCost;

        // <=25k
        if (value <= 25000) {
            sp += 10000; // statToSp(10000)
            value -= 10000;
            inc = 1500;
            startCost = 2;
        }
        // >=25k
        else {
            sp += 107500; // statToSp(25000)
            value -= 25000;
            inc = 1000;
            startCost = 12;
        }

        const endCost = Math.floor(value / inc) + startCost - 1;
        const numIncrements = endCost - startCost + 1;

        // sum of arithmetic series * amount of stats per increment(1500 or 1000)
        sp += (numIncrements / 2) * (startCost + endCost) * inc;
        // remainder
        sp += (value % inc) * (endCost + 1);
        return sp;
    }
}

class StatVaultUI {
    constructor(core) {
        this.core = core;
        this.containerId = "statvault-ui";
        this.entryHostSelector = ".profile-left-side";
        this.entryButtonId = "statvault-open-ui-button";
        this.entryObserver = null;
        this.entryMountQueued = false;
        this.activeView = "personal";
        this.activeLeaderboardGroup = "overall";
        this.activeLeaderboardBoardByGroup = {
            overall: "level",
            raids: "1d",
            damage: "1d",
            destroyers: "1d",
            levels_gained: "1d",
            sp_gained: "1d",
            hall: null,
        };
        this.leaderboardErrors = {};
        this.onEntryButtonClick = this.onEntryButtonClick.bind(this);
        this.onEntryHostMutated = this.onEntryHostMutated.bind(this);
        this.onCloseButtonClick = this.onCloseButtonClick.bind(this);
        this.onSyncNowClick = this.onSyncNowClick.bind(this);
        this.onSupportClick = this.onSupportClick.bind(this);
        this.onViewTabClick = this.onViewTabClick.bind(this);
    }

    // ============================================================================
    // UI ENTRY
    // ============================================================================

    initEntry() {
        ensureStatVaultUIStyles();
        this.ensureProfileEntryButton();
        this.observeEntryHost();
    }

    ensureProfileEntryButton() {
        const host = document.querySelector(this.entryHostSelector);
        if (!host) return;

        const existingButton = host.querySelector(`#${this.entryButtonId}`);
        if (existingButton) return;

        if (getComputedStyle(host).position === "static") {
            host.style.position = "relative";
        }

        const button = document.createElement("button");
        button.id = this.entryButtonId;
        button.type = "button";
        button.textContent = "Stat Vault";
        button.className = "sv-entry-button";
        button.addEventListener("click", this.onEntryButtonClick);

        host.appendChild(button);
    }

    observeEntryHost() {
        if (this.entryObserver) return;

        this.entryObserver = new MutationObserver(this.onEntryHostMutated);
        this.entryObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    onEntryHostMutated() {
        if (this.entryMountQueued) return;

        this.entryMountQueued = true;
        requestAnimationFrame(() => {
            this.entryMountQueued = false;
            this.ensureProfileEntryButton();
        });
    }

    onEntryButtonClick(e) {
        e.preventDefault();
        e.stopPropagation();

        this.showUI();
    }

    // ============================================================================
    // UI
    // ============================================================================

    showUI() {
        const box = this.getOrCreateUIContainer();

        this.renderUI(box);

        box.style.display = box.style.display === "none" || !box.style.display ? "flex" : "none";
    }

    hideUI() {
        const box = document.getElementById(this.containerId);
        if (!box) return;

        box.style.display = "none";
    }

    getOrCreateUIContainer() {
        let box = document.getElementById(this.containerId);

        if (!box) {
            box = Object.assign(document.createElement("div"), { id: this.containerId });
            box.className = "sv-box";
            document.body.appendChild(box);
        } else if (!box.classList.contains("sv-box")) {
            box.classList.add("sv-box");
        }

        return box;
    }

    renderUI(box) {
        box.innerHTML = "";

        box.appendChild(this.buildHeader());

        const content = this.buildContentContainer();
        this.renderActiveMainView(content);
        box.appendChild(content);

        box.appendChild(this.buildMetaInfoRow());
    }

    buildHeader() {
        const header = document.createElement("div");
        header.className = "sv-header";

        const headerMain = document.createElement("div");
        headerMain.className = "sv-header-main";

        const title = document.createElement("div");
        title.textContent = "Stat Vault";
        title.className = "sv-title";

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.textContent = "X";
        closeButton.setAttribute("aria-label", "Close Stat Vault");
        closeButton.className = "sv-close-button";
        closeButton.addEventListener("click", this.onCloseButtonClick);

        headerMain.appendChild(title);
        headerMain.appendChild(this.buildViewTabs());

        header.appendChild(headerMain);
        header.appendChild(closeButton);
        return header;
    }

    onCloseButtonClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.hideUI();
    }

    onSyncNowClick(e) {
        e.preventDefault();
        e.stopPropagation();
        window.location.reload();
    }

    onSupportClick(e) {
        e.preventDefault();
        e.stopPropagation();
        window.open(STATVAULT_SUPPORT_URL, "_blank", "noopener,noreferrer");
    }

    onViewTabClick(nextView) {
        if (this.activeView === nextView) return;

        this.activeView = nextView;
        if (nextView === "leaderboards") {
            this.ensureLeaderboardGroupLoaded(this.activeLeaderboardGroup);
        }

        this.refreshOpenUI();
    }

    onLeaderboardGroupClick(group) {
        if (this.activeLeaderboardGroup === group) return;

        this.activeLeaderboardGroup = group;
        this.ensureLeaderboardGroupLoaded(group);
        this.refreshOpenUI();
    }

    onLeaderboardBoardClick(group, boardKey) {
        if (this.activeLeaderboardBoardByGroup[group] === boardKey) return;

        this.activeLeaderboardBoardByGroup[group] = boardKey;
        this.refreshOpenUI();
    }

    refreshOpenUI() {
        const box = document.getElementById(this.containerId);
        if (!box || box.style.display === "none") {
            return;
        }

        this.renderUI(box);
    }

    ensureLeaderboardGroupLoaded(group) {
        if (!this.core.isLeaderboardEnabled() || !group) {
            return;
        }

        if (this.core.getCachedLeaderboardGroup(group) || this.core.isLeaderboardGroupLoading(group)) {
            return;
        }

        delete this.leaderboardErrors[group];
        void this.core.fetchLeaderboardGroup(group)
            .then(() => {
                delete this.leaderboardErrors[group];
                this.refreshOpenUI();
            })
            .catch((error) => {
                this.leaderboardErrors[group] = error instanceof Error ? error.message : String(error);
                this.refreshOpenUI();
            });
    }

    buildContentContainer() {
        const content = document.createElement("div");
        content.className = "sv-content";
        return content;
    }

    renderActiveMainView(content) {
        if (this.activeView === "leaderboards") {
            this.renderLeaderboardsView(content);
            return;
        }

        this.renderPersonalStatsView(content);
    }

    buildViewTabs() {
        const tabs = document.createElement("div");
        tabs.className = "sv-view-tabs";

        [
            { key: "personal", label: "Personal" },
            { key: "leaderboards", label: "Leaderboards" },
        ].forEach((view) => {
            tabs.appendChild(this.createTabButton(
                view.label,
                this.activeView === view.key,
                () => this.onViewTabClick(view.key)
            ));
        });

        return tabs;
    }

    renderPersonalStatsView(content) {
        const topPanel = document.createElement("div");
        topPanel.appendChild(this.buildMainStatInfoRow());
        content.appendChild(topPanel);

        this.appendSection(content, this.genHighlights(), "sv-table-styled sv-highlights-gap");
        this.appendSection(content, this.genTable(), "sv-table-styled");
    }

    renderLeaderboardsView(content) {
        const shell = document.createElement("div");
        shell.className = "sv-leaderboard-shell";

        const sidebar = document.createElement("div");
        sidebar.className = "sv-leaderboard-sidebar";

        const main = document.createElement("div");
        main.className = "sv-leaderboard-main";

        const stage = document.createElement("div");
        stage.className = "sv-leaderboard-stage";

        if (!this.core.isLeaderboardEnabled()) {
            stage.appendChild(this.createLeaderboardStatus("Leaderboards are unavailable right now."));
            main.appendChild(stage);
            shell.appendChild(sidebar);
            shell.appendChild(main);
            content.appendChild(shell);
            return;
        }

        sidebar.appendChild(this.buildLeaderboardGroupTabs());

        const group = this.activeLeaderboardGroup;
        const groupData = this.core.getCachedLeaderboardGroup(group);
        const groupError = this.leaderboardErrors[group];

        if (!groupData) {
            if (!groupError) {
                this.ensureLeaderboardGroupLoaded(group);
            }
            stage.appendChild(this.createLeaderboardStatus(
                this.core.isLeaderboardGroupLoading(group)
                    ? "Loading leaderboard data..."
                    : groupError || "Reload to try loading this board again."
            ));
            main.appendChild(stage);
            shell.appendChild(sidebar);
            shell.appendChild(main);
            content.appendChild(shell);
            return;
        }

        const boardOptions = this.getLeaderboardBoardOptions(group, groupData);
        const activeBoardKey = this.ensureActiveLeaderboardBoard(group, boardOptions);

        if (!activeBoardKey) {
            stage.appendChild(this.createLeaderboardStatus("No leaderboard data is available for this category yet."));
            main.appendChild(stage);
            shell.appendChild(sidebar);
            shell.appendChild(main);
            content.appendChild(shell);
            return;
        }

        stage.appendChild(this.buildLeaderboardBoardTabs(group, boardOptions));

        const board = groupData.boards?.[activeBoardKey];
        if (!board) {
            stage.appendChild(this.createLeaderboardStatus("This leaderboard board has no data yet."));
            main.appendChild(stage);
            shell.appendChild(sidebar);
            shell.appendChild(main);
            content.appendChild(shell);
            return;
        }

        stage.appendChild(this.buildLeaderboardBoardTable(group, activeBoardKey, board));
        main.appendChild(stage);
        shell.appendChild(sidebar);
        shell.appendChild(main);
        content.appendChild(shell);
    }

    formatRatio(value, divisor) {
        return divisor > 0 ? (value / divisor).toFixed(2) : "N/A";
    }

    buildMainStatInfoRow() {
        const statInfoContainer = document.createElement("div");
        statInfoContainer.className = "sv-stat-info";

        statInfoContainer.appendChild(this.createStatInfoItem("Account Age:", `${this.core.age} days`));
        statInfoContainer.appendChild(this.createStatInfoItem("Stat Points/Age:", this.formatRatio(this.core.globalStats.sp, this.core.age)));
        statInfoContainer.appendChild(this.createStatInfoItem("Stat Points/Level:", this.formatRatio(this.core.globalStats.sp, this.core.globalStats.lvl)));
        statInfoContainer.appendChild(this.createStatInfoItem("Stats/Level:", this.formatRatio(this.core.statSum, this.core.globalStats.lvl)));
        statInfoContainer.appendChild(this.createStatInfoItem("All-time Highest Hit:", this.core.formatNumber(this.core.getAllTimeHighestHit())));

        return statInfoContainer;
    }

    createStatInfoItem(label, value) {
        const item = document.createElement("div");
        item.className = "sv-stat-info-item";

        const labelEl = document.createElement("span");
        labelEl.className = "sv-stat-label";
        labelEl.textContent = label;

        const valueEl = document.createElement("span");
        valueEl.className = "sv-stat-value";
        valueEl.textContent = value;

        item.appendChild(labelEl);
        item.appendChild(document.createTextNode(" "));
        item.appendChild(valueEl);

        return item;
    }

    buildMetaInfoRow() {
        const footer = document.createElement("div");
        footer.className = "sv-footer";

        const syncStatus = this.core.getSyncStatus();

        const leftGroup = document.createElement("div");
        leftGroup.className = "sv-footer-group";
        leftGroup.appendChild(this.createMetaButton("Sync Now", this.onSyncNowClick));
        leftGroup.appendChild(this.createMetaChip("Sync", syncStatus.value, syncStatus.tone));
        leftGroup.appendChild(this.createMetaChip("Last Synced", this.core.getLastSyncedText()));
        leftGroup.appendChild(this.createMetaChip("Last Reload", `${this.core.getLastUpdatedText()} ago`));

        const rightGroup = document.createElement("div");
        rightGroup.className = "sv-footer-group sv-footer-group-right";
        rightGroup.appendChild(this.createMetaButton("Support", this.onSupportClick));
        rightGroup.appendChild(this.createMetaChip("Daily Reset", this.core.getResetCountdownText()));
        rightGroup.appendChild(this.createMetaChip("Version", `${GM_info?.script?.version || "dev"}`));

        footer.appendChild(leftGroup);
        footer.appendChild(rightGroup);

        return footer;
    }

    createMetaChip(label, value, tone = "") {
        const chip = document.createElement("div");
        chip.className = "sv-meta-chip";
        if (tone) {
            chip.classList.add(`sv-meta-chip-sync-${tone}`);
        }

        const labelEl = document.createElement("span");
        labelEl.className = "sv-meta-chip-label";
        labelEl.textContent = label;

        const valueEl = document.createElement("span");
        valueEl.className = "sv-meta-chip-value";
        valueEl.textContent = value;

        chip.appendChild(labelEl);
        chip.appendChild(valueEl);

        return chip;
    }

    createMetaButton(label, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sv-meta-button";
        button.textContent = label;
        button.addEventListener("click", onClick);
        return button;
    }

    createTabButton(label, isActive, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `sv-tab-button${isActive ? " sv-tab-button-active" : ""}`;
        button.textContent = label;
        button.addEventListener("click", onClick);
        return button;
    }

    buildLeaderboardGroupTabs() {
        const tabs = document.createElement("div");
        tabs.className = "sv-leaderboard-group-tabs";

        [
            { key: "overall", label: "Overall" },
            { key: "raids", label: "Raids" },
            { key: "damage", label: "Damage" },
            { key: "destroyers", label: "Highest Hit" },
            { key: "levels_gained", label: "Levels Gained" },
            { key: "sp_gained", label: "SP Gained" },
            { key: "hall", label: "Milestones" },
        ].forEach((group) => {
            tabs.appendChild(this.createTabButton(
                group.label,
                this.activeLeaderboardGroup === group.key,
                () => this.onLeaderboardGroupClick(group.key)
            ));
        });

        return tabs;
    }

    buildLeaderboardBoardTabs(group, boardOptions) {
        const tabs = document.createElement("div");
        tabs.className = "sv-leaderboard-board-tabs";

        boardOptions.forEach((board) => {
            tabs.appendChild(this.createTabButton(
                board.label,
                this.activeLeaderboardBoardByGroup[group] === board.key,
                () => this.onLeaderboardBoardClick(group, board.key)
            ));
        });

        return tabs;
    }

    getLeaderboardBoardOptions(group, groupData) {
        switch (group) {
            case "overall":
                return [
                    { key: "level", label: "Level" },
                    { key: "total_sp", label: "Total SP" },
                    { key: "sp_per_level", label: "SP / Level" },
                ];
            case "destroyers":
                return [
                    { key: "1d", label: "Daily" },
                    { key: "7d", label: "7 Days" },
                    { key: "30d", label: "30 Days" },
                    { key: "all_time", label: "All Time" },
                ];
            case "hall":
                return (groupData?.tiers || []).map((tier) => ({
                    key: String(tier),
                    label: this.getHallTierLabel(tier),
                }));
            default:
                return [
                    { key: "1d", label: "Daily" },
                    { key: "7d", label: "7 Days" },
                    { key: "30d", label: "30 Days" },
                ];
        }
    }

    ensureActiveLeaderboardBoard(group, boardOptions) {
        const current = this.activeLeaderboardBoardByGroup[group];
        const currentIsValid = boardOptions.some((board) => board.key === current);
        if (currentIsValid) {
            return current;
        }

        const next = boardOptions[0]?.key || null;
        this.activeLeaderboardBoardByGroup[group] = next;
        return next;
    }

    createLeaderboardStatus(message) {
        const status = document.createElement("div");
        status.className = "sv-leaderboard-status";
        status.textContent = message;
        return status;
    }

    buildLeaderboardBoardTable(group, boardKey, board) {
        const wrapper = document.createElement("div");
        wrapper.className = "sv-leaderboard-board";

        const table = document.createElement("table");
        table.className = "sv-table sv-table-leaderboard";

        const columns = this.getLeaderboardColumns(group, boardKey);

        const topRows = Array.isArray(board.top) ? board.top : [];
        if (topRows.length === 0 && !board.viewer) {
            wrapper.appendChild(this.createLeaderboardStatus("No players are on this board yet."));
            return wrapper;
        }

        topRows.forEach((row, index) => {
            this.appendLeaderboardTableRow(table, columns, index + 1, row, index % 2 === 0 ? "sv-row-even" : "sv-row-odd");
        });

        if (board.viewer && board.viewerRank) {
            const spacer = table.insertRow();
            spacer.className = "sv-viewer-separator";
            const spacerCell = spacer.insertCell();
            spacerCell.colSpan = columns.length;
            spacerCell.className = "sv-td";

            this.appendLeaderboardTableRow(table, columns, board.viewerRank, board.viewer, "sv-row-viewer");
        }

        const tableStage = document.createElement("div");
        tableStage.className = "sv-leaderboard-table-stage";
        tableStage.appendChild(table);
        wrapper.appendChild(tableStage);
        return wrapper;
    }

    appendLeaderboardTableRow(table, columns, rank, row, rowClassName) {
        const tableRow = table.insertRow();
        tableRow.className = rowClassName;

        columns.forEach((column) => {
            const td = tableRow.insertCell();
            td.className = `sv-td ${column.cellClass || ""}`.trim();

            if (column.rank) {
                td.classList.add("sv-rank-cell", "sv-td-rank");
                td.textContent = this.core.formatNumber(rank);
                return;
            }

            td.textContent = this.formatLeaderboardCellValue(column.key, row[column.key]);
        });
    }

    getLeaderboardColumns(group, boardKey) {
        if (group === "hall") {
            return [
                { key: "rank", label: "#", rank: true },
                { key: "characterName", label: "Name", cellClass: "sv-td-center sv-td-name" },
                { key: "className", label: "Class", cellClass: "sv-td-center sv-td-class" },
                { key: "date", label: "Reached", cellClass: "sv-td-right sv-td-date" },
            ];
        }

        return [
            { key: "rank", label: "#", rank: true },
            { key: "characterName", label: "Name", cellClass: "sv-td-center sv-td-name" },
            { key: "value", label: this.getLeaderboardValueLabel(group, boardKey), cellClass: "sv-td-right sv-td-value" },
        ];
    }

    getHallTierLabel(tier) {
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

    getLeaderboardValueLabel(group, boardKey) {
        if (group === "overall") {
            switch (boardKey) {
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

        switch (group) {
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

    formatLeaderboardCellValue(key, value) {
        if (key === "className") {
            return this.toTitleCase(value);
        }

        if (key === "date") {
            if (!value) return "";
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) {
                return value;
            }

            return date.toISOString().slice(0, 10);
        }

        if (typeof value === "number") {
            return this.core.formatNumber(value);
        }

        return value ?? "";
    }

    toTitleCase(value) {
        return String(value ?? "").replace(/\b\w/g, (char) => char.toUpperCase());
    }

    appendSection(parent, section, sectionClasses) {
        if (!section) return;

        if (sectionClasses) {
            for (const className of sectionClasses.split(" ")) {
                if (className) section.classList.add(className);
            }
        }

        parent.appendChild(section);
    }

    genTable() {
        const table = document.createElement("table");
        table.className = "sv-table";

        const columns = [
            { key: "date", label: "Date" },
            { key: "lvl", label: "Level" },
            { key: "xp", label: "XP" },
            { key: "sp", label: "Total SP" },
            { key: "spGain", label: "SP Gain" },
            { key: "rc", label: "Raids" },
            { key: "dmg", label: "Total Damage" },
            { key: "dmgMax", label: "Highest Hit" },
            { key: "spLvl", label: "SP/Level" },
        ];

        const thead = table.createTHead();
        const headerRow = thead.insertRow();

        columns.forEach((col) => {
            const th = document.createElement("th");
            th.textContent = col.label;
            th.className = col.key === "date" ? "sv-th sv-th-left" : "sv-th";
            headerRow.appendChild(th);
        });

        const sortedEntries = Object.entries(this.core.statStore)
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
                spLvl: stats.lvl > 0 ? (stats.sp / stats.lvl).toFixed(2) : 0,
            };

            const row = table.insertRow();
            row.className = i % 2 === 0 ? "sv-row-even" : "sv-row-odd";

            columns.forEach((col) => {
                const td = row.insertCell();
                const value = rowData[col.key];

                td.textContent = typeof value === "number" ? this.core.formatNumber(value) : value;
                td.className = col.key === "date" ? "sv-td sv-td-left" : "sv-td";
            });
        });

        return table;
    }

    genHighlights() {
        const table = document.createElement("table");
        table.className = "sv-table";

        const hr = table.createTHead().insertRow();
        ["Last", "Levels", "XP", "Stats", "Total Raids", "SP/Raids", "Total Damage", "Highest Hit"].forEach((t, index) => {
            const th = document.createElement("th");
            th.textContent = t;
            th.className = index === 0 ? "sv-th sv-th-left" : "sv-th";
            hr.appendChild(th);
        });

        let dmgMax = this.core.globalStats.dmgMax;
        let dmgTotal = this.core.globalStats.dmg;
        let totalRc = this.core.globalStats.rc;
        const today = new Date();

        let oldestData = this.core.globalStats;

        for (let i = 1; i <= 30; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);

            const stats = this.core.statStore[d.toISOString().slice(0, 10)] || {};

            if (Object.keys(stats).length > 0) {
                oldestData = stats;
            }

            dmgMax = Math.max(dmgMax, stats.dmgMax || 0);
            dmgTotal += stats.dmg || 0;
            totalRc += stats.rc || 0;

            if ([1, 7, 30].includes(i)) {
                const spGain = this.core.globalStats.sp - (stats.sp ?? oldestData.sp);
                const raidsInWindow = i === 1 ? this.core.globalStats.rc : totalRc;
                const row = table.insertRow();
                row.className = "sv-row-even";

                [
                    `${i}d`,
                    this.core.globalStats.lvl - (stats.lvl ?? oldestData.lvl),
                    this.core.globalStats.xp - (stats.xp ?? oldestData.xp),
                    spGain,
                    raidsInWindow,
                    spGain > 0 && raidsInWindow > 0 ? (spGain / raidsInWindow).toFixed(2) : "N/A",
                    i === 1 ? this.core.globalStats.dmg : dmgTotal,
                    i === 1 ? this.core.globalStats.dmgMax : dmgMax,
                ].forEach((v, index) => {
                    const td = row.insertCell();
                    td.textContent = typeof v === "number" ? this.core.formatNumber(v) : v;
                    td.className = index === 0 ? "sv-td sv-td-left" : "sv-td";
                });
            }
        }

        return table;
    }
}

class StatVaultNetwork {
    constructor(core) {
        this.core = core;
        this.interceptionRoutes = [
            {
                matches: (path) => path === "/api/raid/attack",
                handler: (data) => this.core.attackHandler(data),
            },
            {
                matches: (path) => path === "/api/user/info",
                handler: (data) => this.core.infoHandler(data),
            },
            {
                matches: (path) => path.startsWith("/api/raid/join/"),
                handler: (data) => this.core.raidJoinHandler(data),
            },
        ];
    }

    init() {
        this.setupXHRInterception();
        this.setupFetchInterception();
    }

    getInterceptionRoute(path) {
        return this.interceptionRoutes.find((route) => route.matches(path));
    }

    setupXHRInterception() {
        const getInterceptionRoute = this.getInterceptionRoute.bind(this);
        const open = XMLHttpRequest.prototype.open;
        const send = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this._url = url;
            return open.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function () {
            this.addEventListener("load", () => {
                try {
                    const path = new URL(this._url, location.origin).pathname;
                    const route = getInterceptionRoute(path);
                    if (!route) return;

                    route.handler(JSON.parse(this.responseText));
                } catch (_e) {
                    // Ignore invalid URLs and non-JSON responses.
                }
            });

            return send.apply(this, arguments);
        };
    }

    setupFetchInterception() {
        const getInterceptionRoute = this.getInterceptionRoute.bind(this);
        const realFetch = unsafeWindow.fetch;

        unsafeWindow.fetch = function (...args) {
            const urlInput = typeof args[0] === "string" ? args[0] : args[0]?.url;

            return realFetch.apply(this, args).then((response) => {
                try {
                    const path = new URL(urlInput, location.origin).pathname;
                    const route = getInterceptionRoute(path);
                    if (route) {
                        response.clone().json().then((data) => {
                            route.handler(data);
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
    }
}

class StatVaultApp {
    init() {
        this.core = new StatVaultCore();
        this.ui = new StatVaultUI(this.core);
        this.network = new StatVaultNetwork(this.core);

        this.ui.initEntry();
        this.network.init();
    }
}

const app = new StatVaultApp();
app.init();
