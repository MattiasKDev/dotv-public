// ==UserScript==
// @name         stat vault
// @namespace    https://github.com/MattiasKDev
// @author       infinity
// @description  Track player statistics including levels, XP, damage, and raid counts
// @version      2026.05.14
// @match        https://play.dragonsofthevoid.com/*
// @run-at       document-start
// @grant unsafeWindow
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
const STATVAULT_PAGE_WINDOW = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

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

.sv-snapshot-shell {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

.sv-snapshot-toolbar {
    width: min(430px, 100%);
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 215, 160, 0.12);
    border-radius: 14px;
    background: rgba(34, 24, 15, 0.58);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
    box-sizing: border-box;
}

.sv-snapshot-toolbar-row {
    display: contents;
}

.sv-snapshot-toolbar-title {
    align-self: center;
    color: #f8e6c1;
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
}

.sv-snapshot-date-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    grid-column: 1 / -1;
}

.sv-snapshot-date-button {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 1px solid rgba(255, 215, 160, 0.24);
    background: linear-gradient(180deg, #4c3522 0%, #3d2b1c 100%);
    color: #f8e6c1;
    font-size: 18px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
}

.sv-snapshot-date-button:hover:not(:disabled) {
    background: linear-gradient(180deg, #5a3f29 0%, #473120 100%);
}

.sv-snapshot-date-button:disabled {
    cursor: default;
    opacity: 0.4;
}

.sv-snapshot-date-display {
    min-width: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 3px 10px;
}

.sv-snapshot-date-label,
.sv-snapshot-stat-label {
    color: rgba(255, 220, 170, 0.58);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
}

.sv-snapshot-date-value {
    width: 150px;
    border: 0;
    outline: 0;
    background: transparent;
    color: #f6eee2;
    font-size: 14px;
    font-weight: 800;
    font-family: inherit;
    text-align: center;
    cursor: pointer;
}

.sv-snapshot-date-value::-webkit-calendar-picker-indicator {
    cursor: pointer;
    filter: invert(0.92) sepia(0.28) saturate(1.4) hue-rotate(345deg);
    opacity: 0.72;
}

.sv-snapshot-date-note {
    min-height: 12px;
    color: rgba(255, 220, 170, 0.52);
    font-size: 10px;
    font-weight: 700;
    text-align: center;
}

.sv-snapshot-copy-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 7px 11px;
    border-radius: 8px;
    border: 1px solid rgba(255, 215, 160, 0.18);
    background: rgba(255, 255, 255, 0.045);
    color: #f8e6c1;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
}

.sv-snapshot-copy-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.075);
}

.sv-snapshot-copy-button:disabled {
    cursor: default;
    opacity: 0.58;
}

.sv-snapshot-card {
    position: relative;
    width: min(430px, 100%);
    display: block;
    overflow: hidden;
    border: 1px solid rgba(255, 215, 160, 0.16);
    border-radius: 12px;
    background: #22180f;
    box-shadow: 0 12px 28px rgba(0,0,0,0.28);
}

.sv-snapshot-class-line {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    margin-top: 12px;
    color: #f6eee2;
    font-size: 16px;
    font-weight: 700;
}

.sv-snapshot-class-icon {
    width: 34px;
    height: 34px;
    object-fit: contain;
    border: 1px solid rgba(255, 215, 160, 0.08);
    border-radius: 8px;
    background: rgba(18, 13, 8, 0.58);
}

.sv-snapshot-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 18px;
    padding: 24px 24px 26px;
}

.sv-snapshot-kicker {
    color: rgba(255, 220, 170, 0.64);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
}

.sv-snapshot-name {
    margin-top: 8px;
    color: #fff6e8;
    font-size: 34px;
    font-weight: 800;
    line-height: 1.05;
    overflow-wrap: anywhere;
}

.sv-snapshot-stats {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.sv-snapshot-stat {
    min-width: 0;
    padding: 13px 14px 14px;
    border: 1px solid rgba(255, 215, 160, 0.12);
    border-radius: 8px;
    background: rgba(7, 10, 9, 0.20);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}

.sv-snapshot-stat-value {
    margin-top: 5px;
    color: #fff6e8;
    font-size: 26px;
    font-weight: 800;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
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

    .sv-snapshot-card {
        width: 100%;
    }

}

@media (max-width: 720px) {
    .sv-snapshot-toolbar {
        align-items: stretch;
        grid-template-columns: 1fr;
    }

    .sv-snapshot-copy-button,
    .sv-snapshot-date-controls {
        grid-column: 1;
    }

    .sv-snapshot-body {
        padding: 24px;
    }

    .sv-snapshot-name {
        font-size: 32px;
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
            className: "",
            classKey: "",
        };
        this.classMilestones = [];
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

    formatRatio(value, divisor) {
        return divisor > 0 ? (value / divisor).toFixed(2) : "N/A";
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
        return STATVAULT_PAGE_WINDOW.fetch
            ? STATVAULT_PAGE_WINDOW.fetch.bind(STATVAULT_PAGE_WINDOW)
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
        const payload = data.payload;
        const user = payload.user;
        this.classMilestones = this.extractClassMilestones(payload.inventory?.items || {});
        const profileMeta = this.extractProfileMeta(payload, this.classMilestones);

        this.age = Math.floor(
            (Date.now() - new Date(user.create_dttm).getTime()) / (1000 * 60 * 60 * 24)
        );
        this.userProfile.id = String(user.id ?? "");
        this.userProfile.characterName = String(user.characterName ?? "");
        this.userProfile.accountCreatedAt = this.normalizeDateTime(user.create_dttm);
        this.userProfile.className = profileMeta.className;
        this.userProfile.classKey = profileMeta.classKey;
        this.activateUserStorage(this.userProfile.id);

        const stats = this.parseUserInfo(payload);
        this.globalStats.lvl = stats.lvl;
        this.globalStats.rc = stats.rc;
        this.globalStats.sp = stats.sp;
        this.globalStats.xp = stats.xp;
        this.updateLog();
        void this.syncWithRemote(payload);
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
        const classFromBanners = this.extractClassMilestones(inventoryItems);
        console.log("[statvault] Banners found in inventory:", classFromBanners);
        const limitedBanners = classFromBanners.slice(0, 4);
        console.log("[statvault] Class from banners:", limitedBanners);
        return limitedBanners;
    }

    extractClassMilestones(inventoryItems) {
        const lvlTiers = [10, 100, 500, 1000, 2000, 3000, 4000, 5000, 6000];
        const banners = [];

        for (const key in inventoryItems || {}) {
            if (!key.startsWith("ba.")) continue;

            let classKey = key.slice(3);
            if (classKey.endsWith("-banner")) {
                classKey = classKey.slice(0, -7);
            }

            const createdAt = inventoryItems[key]?.created;
            const earnedAt = this.normalizeBannerReachedAt(createdAt);

            banners.push({
                classKey,
                className: this.classKeyToName(classKey),
                createdAt,
                earnedAt,
                earnedAtMs: earnedAt ? new Date(earnedAt).getTime() : 0,
            });
        }

        banners.sort((a, b) => (a.earnedAtMs || 0) - (b.earnedAtMs || 0));

        return banners.map((banner, idx) => ({
            ...banner,
            lvlTier: lvlTiers[idx] ?? null
        }));
    }

    extractProfileMeta(payload, classMilestones = []) {
        const user = payload?.user || {};
        const latestMilestone = classMilestones[classMilestones.length - 1] || {};
        const rawClassName = this.firstText([
            user.class,
            user.className,
            user.class_name,
            user.characterClass,
            user.character_class,
            user.class?.name,
            user.profession,
        ]);
        const rawClassKey = this.firstText([
            user.classKey,
            user.class_key,
            user.class?.key,
            user.class?.id,
        ]);
        const classKey = this.normalizeClassKey(rawClassKey || rawClassName || latestMilestone.classKey || latestMilestone.className);
        const className = rawClassName
            ? this.classKeyToName(rawClassName)
            : latestMilestone.className || this.classKeyToName(classKey);

        return {
            className: className || "Unknown",
            classKey,
        };
    }

    firstText(values) {
        for (const value of values) {
            if (typeof value !== "string" && typeof value !== "number") continue;

            const text = String(value).trim();
            if (text) return text;
        }

        return "";
    }

    normalizeClassKey(value) {
        return String(value ?? "")
            .trim()
            .replace(/^ba\./, "")
            .replace(/-banner$/, "")
            .toLowerCase()
            .replace(/['"]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    classKeyToName(value) {
        return String(value ?? "")
            .trim()
            .replace(/^ba\./, "")
            .replace(/-banner$/, "")
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    isValidDateKey(dateKey) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey ?? ""));
    }

    getSnapshotDates() {
        const loggedDates = Object.entries(this.statStore)
            .filter(([date, stats]) => this.isValidDateKey(date) && !stats?.syntheticBaseline)
            .map(([date]) => date)
            .sort((a, b) => a.localeCompare(b));

        if (loggedDates.length > 0) {
            return loggedDates;
        }

        return Object.keys(this.statStore)
            .filter((date) => this.isValidDateKey(date))
            .sort((a, b) => a.localeCompare(b));
    }

    getLatestSnapshotDate() {
        const dates = this.getSnapshotDates();
        return dates[dates.length - 1] || this.currentDate;
    }

    getSnapshotStats(dateKey) {
        if (this.statStore[dateKey]) {
            return this.normalizeStoredStatRow(this.statStore[dateKey]);
        }

        if (dateKey === this.currentDate) {
            return this.createStatSnapshot(this.globalStats);
        }

        return this.createEmptyStatRow();
    }

    getAccountAgeForDate(dateKey) {
        const createdAtMs = new Date(this.userProfile.accountCreatedAt).getTime();
        if (!Number.isFinite(createdAtMs)) {
            return this.age || 0;
        }

        const targetMs = dateKey === this.currentDate
            ? Date.now()
            : new Date(`${dateKey}T23:59:59.999Z`).getTime();

        if (!Number.isFinite(targetMs)) {
            return this.age || 0;
        }

        return Math.max(0, Math.floor((targetMs - createdAtMs) / (1000 * 60 * 60 * 24)));
    }

    getClassForDate(dateKey) {
        const selectedDateMs = new Date(`${dateKey}T23:59:59.999Z`).getTime();
        let selectedMilestone = null;

        if (Number.isFinite(selectedDateMs)) {
            for (const milestone of this.classMilestones) {
                if (!milestone.earnedAtMs || milestone.earnedAtMs > selectedDateMs) continue;
                selectedMilestone = milestone;
            }
        }

        const classKey = selectedMilestone?.classKey || this.userProfile.classKey;
        const className = selectedMilestone?.className || this.userProfile.className;

        return {
            classKey: this.normalizeClassKey(classKey),
            className: className || "Unknown",
        };
    }

    getSnapshotData(dateKey) {
        const date = this.isValidDateKey(dateKey) ? dateKey : this.getLatestSnapshotDate();
        const stats = this.getSnapshotStats(date);
        const classInfo = this.getClassForDate(date);

        return {
            date,
            characterName: this.userProfile.characterName || "Unknown Hero",
            className: classInfo.className,
            classKey: classInfo.classKey,
            level: stats.lvl,
            totalStatPoints: stats.sp,
            statPointsPerLevel: this.formatRatio(stats.sp, stats.lvl),
        };
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
        this.activeSnapshotDate = "";
        this.snapshotCopyInFlight = false;
        this.snapshotCopyStatus = "";
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
        } else if (nextView === "snapshot") {
            this.ensureActiveSnapshotDate();
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

        if (this.activeView === "snapshot") {
            this.renderSnapshotView(content);
            return;
        }

        this.renderPersonalStatsView(content);
    }

    buildViewTabs() {
        const tabs = document.createElement("div");
        tabs.className = "sv-view-tabs";

        [
            { key: "personal", label: "Personal" },
            { key: "snapshot", label: "Snapshot" },
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

    renderSnapshotView(content) {
        const snapshotDate = this.ensureActiveSnapshotDate();
        const snapshot = this.core.getSnapshotData(snapshotDate);
        const shell = document.createElement("div");
        shell.className = "sv-snapshot-shell";

        shell.appendChild(this.buildSnapshotToolbar(snapshot));
        shell.appendChild(this.buildSnapshotCard(snapshot));
        content.appendChild(shell);
    }

    ensureActiveSnapshotDate() {
        const dates = this.core.getSnapshotDates();
        if (!this.activeSnapshotDate || (dates.length > 0 && !dates.includes(this.activeSnapshotDate))) {
            this.activeSnapshotDate = this.core.getLatestSnapshotDate();
        }

        return this.activeSnapshotDate || this.core.getLatestSnapshotDate();
    }

    onSnapshotDateStep(direction) {
        const dates = this.core.getSnapshotDates();
        if (dates.length === 0) return;

        const currentDate = this.ensureActiveSnapshotDate();
        const currentIndex = Math.max(0, dates.indexOf(currentDate));
        const nextIndex = Math.max(0, Math.min(dates.length - 1, currentIndex + direction));
        if (nextIndex === currentIndex) return;

        this.activeSnapshotDate = dates[nextIndex];
        this.refreshOpenUI();
    }

    onSnapshotDatePick(date) {
        const dates = this.core.getSnapshotDates();
        if (dates.length === 0 || !this.core.isValidDateKey(date)) return;

        this.activeSnapshotDate = this.getClosestSnapshotDate(date, dates);
        this.refreshOpenUI();
    }

    getClosestSnapshotDate(date, dates) {
        if (dates.includes(date)) {
            return date;
        }

        const earlierDates = dates.filter((loggedDate) => loggedDate <= date);
        if (earlierDates.length > 0) {
            return earlierDates[earlierDates.length - 1];
        }

        return dates[0];
    }

    buildSnapshotToolbar(snapshot) {
        const dates = this.core.getSnapshotDates();
        const currentIndex = dates.indexOf(snapshot.date);
        const hasPrevious = currentIndex > 0;
        const hasNext = currentIndex >= 0 && currentIndex < dates.length - 1;
        const toolbar = document.createElement("div");
        toolbar.className = "sv-snapshot-toolbar";

        const topRow = document.createElement("div");
        topRow.className = "sv-snapshot-toolbar-row";

        const title = document.createElement("div");
        title.className = "sv-snapshot-toolbar-title";
        title.textContent = "Snapshot";

        const controls = document.createElement("div");
        controls.className = "sv-snapshot-date-controls";
        controls.appendChild(this.createSnapshotDateButton("<", "Previous logged date", !hasPrevious, () => this.onSnapshotDateStep(-1)));
        controls.appendChild(this.buildSnapshotDateDisplay(snapshot.date, dates));
        controls.appendChild(this.createSnapshotDateButton(">", "Next logged date", !hasNext, () => this.onSnapshotDateStep(1)));

        topRow.appendChild(title);
        topRow.appendChild(this.createSnapshotCopyButton());
        toolbar.appendChild(topRow);
        toolbar.appendChild(controls);
        return toolbar;
    }

    createSnapshotCopyButton() {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sv-snapshot-copy-button";
        button.textContent = this.snapshotCopyInFlight
            ? "Copying..."
            : this.snapshotCopyStatus || "Copy Image";
        button.disabled = this.snapshotCopyInFlight;
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            void this.onCopySnapshotImage();
        });
        return button;
    }

    async onCopySnapshotImage() {
        if (this.snapshotCopyInFlight) return;

        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
            this.setSnapshotCopyStatus("Unavailable");
            return;
        }

        this.snapshotCopyInFlight = true;
        this.snapshotCopyStatus = "";
        this.refreshOpenUI();

        try {
            const snapshot = this.core.getSnapshotData(this.ensureActiveSnapshotDate());
            const blob = await this.renderSnapshotImageBlob(snapshot);
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob }),
            ]);
            this.setSnapshotCopyStatus("Copied");
        } catch (error) {
            console.error("[statvault] Snapshot image copy failed", error);
            this.setSnapshotCopyStatus("Copy failed");
        } finally {
            this.snapshotCopyInFlight = false;
            this.refreshOpenUI();
        }
    }

    setSnapshotCopyStatus(status) {
        this.snapshotCopyStatus = status;
        this.refreshOpenUI();

        window.setTimeout(() => {
            if (this.snapshotCopyStatus !== status) return;

            this.snapshotCopyStatus = "";
            this.refreshOpenUI();
        }, 1800);
    }

    createSnapshotDateButton(label, ariaLabel, disabled, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sv-snapshot-date-button";
        button.textContent = label;
        button.disabled = disabled;
        button.setAttribute("aria-label", ariaLabel);
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
        return button;
    }

    buildSnapshotDateDisplay(date, dates) {
        const wrapper = document.createElement("div");
        wrapper.className = "sv-snapshot-date-display";

        const label = document.createElement("div");
        label.className = "sv-snapshot-date-label";
        label.textContent = "Date";

        const value = document.createElement("input");
        const firstDate = dates[0] || date;
        const lastDate = dates[dates.length - 1] || date;
        value.className = "sv-snapshot-date-value";
        value.type = "date";
        value.value = date;
        value.min = firstDate;
        value.max = lastDate;
        value.setAttribute("aria-label", "Snapshot date");
        value.addEventListener("change", () => this.onSnapshotDatePick(value.value));

        const note = document.createElement("div");
        note.className = "sv-snapshot-date-note";
        note.textContent = dates.includes(date) ? "" : "Nearest logged day";

        wrapper.appendChild(label);
        wrapper.appendChild(value);
        wrapper.appendChild(note);
        return wrapper;
    }

    buildSnapshotCard(snapshot) {
        const card = document.createElement("div");
        card.className = "sv-snapshot-card";

        const body = document.createElement("div");
        body.className = "sv-snapshot-body";

        const identity = document.createElement("div");

        const kicker = document.createElement("div");
        kicker.className = "sv-snapshot-kicker";
        kicker.textContent = this.formatSnapshotDate(snapshot.date);

        const name = document.createElement("div");
        name.className = "sv-snapshot-name";
        name.textContent = snapshot.characterName;

        identity.appendChild(kicker);
        identity.appendChild(name);
        identity.appendChild(this.buildSnapshotClassLine(snapshot));

        body.appendChild(identity);
        body.appendChild(this.buildSnapshotStats(snapshot));
        card.appendChild(body);

        return card;
    }

    buildSnapshotClassLine(snapshot) {
        const classLine = document.createElement("div");
        classLine.className = "sv-snapshot-class-line";

        const src = this.getSnapshotBannerUrl(snapshot.classKey);
        if (src) {
            const img = document.createElement("img");
            img.className = "sv-snapshot-class-icon";
            img.src = src;
            img.alt = "";
            img.addEventListener("error", () => img.remove(), { once: true });
            classLine.appendChild(img);
        }

        const className = document.createElement("span");
        className.textContent = this.toTitleCase(snapshot.className);
        classLine.appendChild(className);

        return classLine;
    }

    getSnapshotBannerUrl(classKey) {
        return classKey
            ? `https://files.dragonsofthevoid.com/images/item/banners/${encodeURIComponent(classKey)}_banner.png`
            : "";
    }

    async renderSnapshotImageBlob(snapshot) {
        const classIcon = await this.loadSnapshotClassIcon(snapshot);
        const canvas = document.createElement("canvas");
        const width = 720;
        const height = 760;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Canvas is unavailable");
        }

        const colors = {
            page: "#160f0a",
            card: "#22180f",
            panel: "#1a120c",
            border: "#4a3824",
            borderSoft: "#3a2a1b",
            label: "#a89269",
            text: "#fff6e8",
            muted: "#d3c0a0",
        };
        const fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

        ctx.fillStyle = colors.page;
        ctx.fillRect(0, 0, width, height);

        this.drawRoundedRect(ctx, 24, 24, 672, 712, 18, colors.card, colors.border, 2);

        ctx.fillStyle = colors.label;
        ctx.font = `800 24px ${fontFamily}`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(this.formatSnapshotDate(snapshot.date).toUpperCase(), 64, 88);

        this.drawFittedText(ctx, snapshot.characterName, 64, 158, 592, 64, 34, 900, colors.text, fontFamily);

        const classY = 196;
        let classTextX = 64;
        if (classIcon) {
            this.drawRoundedRect(ctx, 64, classY - 30, 44, 44, 8, colors.panel, colors.borderSoft, 1);
            ctx.drawImage(classIcon, 69, classY - 25, 34, 34);
            classTextX = 122;
        }

        ctx.fillStyle = colors.text;
        ctx.font = `800 28px ${fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.fillText(this.toTitleCase(snapshot.className), classTextX, classY - 8);

        const rows = [
            ["LEVEL", this.core.formatNumber(snapshot.level)],
            ["TOTAL STAT POINTS", this.core.formatNumber(snapshot.totalStatPoints)],
            ["STAT POINTS / LEVEL", snapshot.statPointsPerLevel],
        ];
        const rowX = 58;
        const rowW = 604;
        const rowH = 118;
        const rowGap = 18;
        let rowY = 292;

        rows.forEach(([label, value]) => {
            this.drawRoundedRect(ctx, rowX, rowY, rowW, rowH, 12, colors.panel, colors.borderSoft, 1);

            ctx.fillStyle = colors.label;
            ctx.font = `800 18px ${fontFamily}`;
            ctx.textBaseline = "alphabetic";
            ctx.fillText(label, rowX + 26, rowY + 35);

            this.drawFittedText(ctx, value, rowX + 26, rowY + 88, rowW - 52, 42, 28, 900, colors.text, fontFamily);

            rowY += rowH + rowGap;
        });

        return this.canvasToBlob(canvas);
    }

    async loadSnapshotClassIcon(snapshot) {
        const src = this.getSnapshotBannerUrl(snapshot.classKey);
        if (!src) return null;

        try {
            const dataUrl = await this.loadImageAsDataUrl(src);
            return await this.loadImageElement(dataUrl);
        } catch (_error) {
            return null;
        }
    }

    loadImageAsDataUrl(src) {
        return fetch(src)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Image request failed with status ${response.status}`);
                }

                return response.blob();
            })
            .then((blob) => this.blobToDataUrl(blob));
    }

    blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Image could not be read"));
            reader.readAsDataURL(blob);
        });
    }

    loadImageElement(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Image could not be loaded"));
            img.src = src;
        });
    }

    canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }

                reject(new Error("Snapshot image could not be created"));
            }, "image/png");
        });
    }

    drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle = "", lineWidth = 1) {
        const safeRadius = Math.min(radius, width / 2, height / 2);

        ctx.beginPath();
        ctx.moveTo(x + safeRadius, y);
        ctx.lineTo(x + width - safeRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
        ctx.lineTo(x + width, y + height - safeRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
        ctx.lineTo(x + safeRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
        ctx.lineTo(x, y + safeRadius);
        ctx.quadraticCurveTo(x, y, x + safeRadius, y);
        ctx.closePath();

        if (fillStyle) {
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }

        if (strokeStyle) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    }

    drawFittedText(ctx, text, x, y, maxWidth, maxFontSize, minFontSize, weight, fillStyle, fontFamily) {
        const safeText = String(text ?? "");
        let fontSize = maxFontSize;

        while (fontSize > minFontSize) {
            ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
            if (ctx.measureText(safeText).width <= maxWidth) break;
            fontSize -= 1;
        }

        ctx.fillStyle = fillStyle;
        ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(safeText, x, y);
    }

    buildSnapshotStats(snapshot) {
        const stats = document.createElement("div");
        stats.className = "sv-snapshot-stats";

        [
            ["Level", this.core.formatNumber(snapshot.level)],
            ["Total Stat Points", this.core.formatNumber(snapshot.totalStatPoints)],
            ["Stat Points / Level", snapshot.statPointsPerLevel],
        ].forEach(([label, value]) => {
            stats.appendChild(this.createSnapshotStat(label, value));
        });

        return stats;
    }

    createSnapshotStat(label, value) {
        const stat = document.createElement("div");
        stat.className = "sv-snapshot-stat";

        const labelEl = document.createElement("div");
        labelEl.className = "sv-snapshot-stat-label";
        labelEl.textContent = label;

        const valueEl = document.createElement("div");
        valueEl.className = "sv-snapshot-stat-value";
        valueEl.textContent = value;

        stat.appendChild(labelEl);
        stat.appendChild(valueEl);
        return stat;
    }

    formatSnapshotDate(date) {
        if (!this.core.isValidDateKey(date)) {
            return date || "Unknown";
        }

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const [year, month, day] = date.split("-");
        const monthLabel = months[Number(month) - 1] || month;
        return `${monthLabel} ${Number(day)}, ${year}`;
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
        const NativeXHR = STATVAULT_PAGE_WINDOW.XMLHttpRequest || XMLHttpRequest;

        function StatVaultXMLHttpRequest() {
            const xhr = new NativeXHR();

            xhr.addEventListener("load", function () {
                try {
                    const path = new URL(this.responseURL, location.origin).pathname;
                    const route = getInterceptionRoute(path);
                    if (!route) return;

                    route.handler(JSON.parse(this.responseText));
                } catch (_e) {
                    // Ignore invalid URLs and non-JSON responses.
                }
            });

            return xhr;
        }

        StatVaultXMLHttpRequest.prototype = NativeXHR.prototype;
        Object.setPrototypeOf(StatVaultXMLHttpRequest, NativeXHR);
        STATVAULT_PAGE_WINDOW.XMLHttpRequest = StatVaultXMLHttpRequest;
    }

    setupFetchInterception() {
        const getInterceptionRoute = this.getInterceptionRoute.bind(this);
        const ResponseCtor = STATVAULT_PAGE_WINDOW.Response || Response;
        const responsePrototype = ResponseCtor?.prototype;
        if (!responsePrototype || responsePrototype.__statVaultResponseInterceptionAttached) return;

        const realJson = responsePrototype.json;
        const realText = responsePrototype.text;
        const realClone = responsePrototype.clone;
        const responseKeys = new WeakMap();
        const handledResponseKeys = new Set();
        let nextResponseKey = 1;

        responsePrototype.__statVaultResponseInterceptionAttached = true;

        const getResponseKey = (response) => {
            let key = responseKeys.get(response);
            if (!key) {
                key = nextResponseKey++;
                responseKeys.set(response, key);
            }

            return key;
        };

        const scheduleRouteHandler = (response, getDataPromise) => {
            let route;
            let key;

            try {
                const path = new URL(response.url, location.origin).pathname;
                route = getInterceptionRoute(path);
                if (!route) return;

                key = getResponseKey(response);
                if (handledResponseKeys.has(key)) return;
                handledResponseKeys.add(key);
            } catch (_e) {
                // Ignore invalid URLs and keep response behavior unchanged.
                return;
            }

            const dataPromise = getDataPromise();
            dataPromise.then((data) => {
                try {
                    route.handler(data);
                } catch (_e) {
                    // Keep the page response untouched if handling fails.
                }
            }).catch(() => {
                // Ignore non-JSON or empty responses.
            });
        };

        if (typeof realClone === "function") {
            responsePrototype.clone = function () {
                const clonedResponse = realClone.apply(this, arguments);
                responseKeys.set(clonedResponse, getResponseKey(this));
                return clonedResponse;
            };
        }

        if (typeof realJson === "function") {
            responsePrototype.json = function () {
                const dataPromise = realJson.apply(this, arguments);
                scheduleRouteHandler(this, () => dataPromise);
                return dataPromise;
            };
        }

        if (typeof realText === "function") {
            responsePrototype.text = function () {
                const textPromise = realText.apply(this, arguments);
                scheduleRouteHandler(this, () => textPromise.then((text) => JSON.parse(text)));
                return textPromise;
            };
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
