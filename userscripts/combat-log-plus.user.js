// ==UserScript==
// @name         Combat Log Plus
// @namespace    https://github.com/MattiasKDev
// @author       infinity
// @description  Adds passive damage-taken breakdowns to raid battle logs.
// @version      2026.06.06
// @match        https://play.dragonsofthevoid.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @supportURL   https://github.com/MattiasKDev/dotv-public#support
// @updateURL    https://raw.githubusercontent.com/MattiasKDev/dotv-public/main/userscripts/combat-log-plus.user.js
// @downloadURL  https://raw.githubusercontent.com/MattiasKDev/dotv-public/main/userscripts/combat-log-plus.user.js
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT = 'combat-log-plus';
    const STYLE_ID = 'dotv-clp-style';
    const LOG_CONTAINER_SELECTOR = '.battle-log-container';
    const ATTACK_PATH = '/api/raid/attack';
    const RAID_ABILITY_PATH = '/api/raid/ability';
    const USER_INFO_PATH = '/api/user/info';
    const USER_STATS_PATH = '/api/user/stats';
    const STARTUP_BATCH_PATH = '/api/data/startup-batch';
    const RAID_BATCH_PATH = '/api/data/raids/batch';
    const ARMY_CAMP_PREFIX = '/api/army-camp/';
    const FORMATION_SAVE_PATH = '/api/formation/save';
    const PENDING_TTL_MS = 8000;
    const APPLIED_REFRESH_MS = 500;
    const RECENT_LOG_ROW_SCAN = 300;
    const BODY_OBSERVER_THROTTLE_MS = 150;
    const LOG_STABLE_MS = 20;
    const MIN_LOG_WIDTH = 420;
    const DEFAULT_CAP_HITS = 20;
    const COMPACT_KEY = 'dotvCombatLogPlusCompact';
    const ENHANCED_VISIBLE_KEY = 'dotvCombatLogPlusEnhancedVisible';
    const DAMAGE_COLLAPSED_KEY = 'dotvCombatLogPlusDamageCollapsed';
    const FORMATION_COLLAPSED_KEY = 'dotvCombatLogPlusFormationCollapsed';
    const SHOW_ARMY_EVENTS_KEY = 'dotvCombatLogPlusShowArmyEvents';
    const SHOW_HEALS_KEY = 'dotvCombatLogPlusShowHeals';
    const SHOW_RAID_ABILITIES_KEY = 'dotvCombatLogPlusShowRaidAbilities';
    const SHOW_MAGIC_PROCS_KEY = 'dotvCombatLogPlusShowMagicProcs';
    const SHOW_TEXT_MODS_KEY = 'dotvCombatLogPlusShowTextMods';
    const VANILLA_CAP_ENABLED_KEY = 'dotvCombatLogPlusVanillaCapEnabled';
    const VANILLA_CAP_ROWS_KEY = 'dotvCombatLogPlusVanillaCapRows';
    const COORDINATED_ALTERATION_TYPE = 'raiddamagealterationcoordinated';
    const DAMAGE_TYPES = new Set(['acid', 'dark', 'fire', 'holy', 'ice', 'lightning', 'magic', 'nature', 'physical', 'poison', 'psychic']);
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const raidDataById = new Map();
    const userRaidById = new Map();
    const itemData = new Map();
    const commanderHpById = new Map();
    const activeTroopQtyById = new Map();
    const pendingInventoryItems = [];
    const pendingHits = [];
    const rawLogEntries = [];
    const rawCapturedRows = new WeakSet();
    const renderedEnhancedHits = new Set();
    const observedLogContainers = new WeakSet();
    const enhancedCardData = new WeakMap();
    const lastLogMutationAt = new WeakMap();
    let statsSnapshot = null;
    let applyTimer = 0;
    let bodyObserveTimer = 0;
    let applyingLogUpdates = false;
    let hitSeq = 0;
    let reserveCapBonus = 0;
    let settingsPanel = null;
    let settingsCloseHandler = null;

    const norm = value => String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
    const difficulty = value => /legendary/i.test(value || '') ? 'legendary' : /hard/i.test(value || '') ? 'hard' : 'easy';
    const number = value => {
        const parsed = Number(String(value ?? '').replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    };
    const pct = value => `${(value * 100).toFixed(2)}%`;
    const pctRange = (low, high) => {
        const format = value => `${value < 0 ? '-' : ''}${pct(Math.abs(value))}`;
        return `${format(Math.min(low, high))} to ${format(Math.max(low, high))}`;
    };
    const statText = value => Number.isFinite(value) ? formatPrecise(value) : '?';
    const formatNumber = value => Number.isFinite(value)
        ? Math.round(value).toLocaleString('en-US')
        : '?';
    const formatPrecise = value => Number.isFinite(value)
        ? Number(value.toFixed(8)).toLocaleString('en-US')
        : '?';
    const formatDamage = value => {
        if (!Number.isFinite(value)) return '?';
        const rounded = Math.round(value);
        return Math.abs(value - rounded) < 1e-6 ? formatNumber(rounded) : formatPrecise(value);
    };
    const formatHitSplit = (total, count) => {
        if (!Number.isFinite(total) || !Number.isFinite(count) || count <= 1) return formatDamage(total);
        const average = total / count;
        return `${count} x ${formatDamage(average)}`;
    };
    const titleCase = value => String(value || '').split(/\s+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    const damageTypeName = value => {
        const type = norm(value);
        return DAMAGE_TYPES.has(type) ? type : '';
    };
    function settingBool(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value == null ? fallback : value !== '0';
        } catch {
            return fallback;
        }
    }
    function setSettingBool(key, value) {
        try {
            localStorage.setItem(key, value ? '1' : '0');
        } catch { }
    }
    const compactEnabled = () => settingBool(COMPACT_KEY, true);
    const setCompactEnabled = value => setSettingBool(COMPACT_KEY, value);
    const enhancedLogVisible = () => settingBool(ENHANCED_VISIBLE_KEY, true);
    const setEnhancedLogVisible = value => setSettingBool(ENHANCED_VISIBLE_KEY, value);
    const damageCollapsed = () => settingBool(DAMAGE_COLLAPSED_KEY, true);
    const setDamageCollapsed = value => setSettingBool(DAMAGE_COLLAPSED_KEY, value);
    const formationCollapsed = () => settingBool(FORMATION_COLLAPSED_KEY, true);
    const setFormationCollapsed = value => setSettingBool(FORMATION_COLLAPSED_KEY, value);
    const showArmyEvents = () => settingBool(SHOW_ARMY_EVENTS_KEY, true);
    const setShowArmyEvents = value => setSettingBool(SHOW_ARMY_EVENTS_KEY, value);
    const showHeals = () => settingBool(SHOW_HEALS_KEY, true);
    const setShowHeals = value => setSettingBool(SHOW_HEALS_KEY, value);
    const showRaidAbilities = () => settingBool(SHOW_RAID_ABILITIES_KEY, true);
    const setShowRaidAbilities = value => setSettingBool(SHOW_RAID_ABILITIES_KEY, value);
    const showMagicProcs = () => settingBool(SHOW_MAGIC_PROCS_KEY, true);
    const setShowMagicProcs = value => setSettingBool(SHOW_MAGIC_PROCS_KEY, value);
    const showTextMods = () => settingBool(SHOW_TEXT_MODS_KEY, true);
    const setShowTextMods = value => setSettingBool(SHOW_TEXT_MODS_KEY, value);
    const vanillaCapEnabled = () => settingBool(VANILLA_CAP_ENABLED_KEY, false);
    const setVanillaCapEnabled = value => setSettingBool(VANILLA_CAP_ENABLED_KEY, value);
    const vanillaCapRows = () => {
        try {
            const stored = localStorage.getItem(VANILLA_CAP_ROWS_KEY);
            if (stored == null || stored === '') return DEFAULT_CAP_HITS;
            const value = Number(stored);
            return Number.isFinite(value) ? Math.max(1, Math.min(3000, Math.round(value))) : DEFAULT_CAP_HITS;
        } catch {
            return DEFAULT_CAP_HITS;
        }
    };
    const setVanillaCapRows = value => {
        try {
            localStorage.setItem(VANILLA_CAP_ROWS_KEY, String(Math.max(1, Math.min(3000, Math.round(Number(value) || DEFAULT_CAP_HITS)))));
        } catch { }
    };

    function parseRequestBody(body) {
        if (!body) return null;
        if (typeof body === 'string') {
            if (!body.trim()) return null;
            try {
                return JSON.parse(body);
            } catch {
                return null;
            }
        }
        if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
            return Object.fromEntries(body.entries());
        }
        if (typeof FormData !== 'undefined' && body instanceof FormData) return null;
        if (typeof Blob !== 'undefined' && body instanceof Blob) return null;
        return typeof body === 'object' ? body : null;
    }

    function baseItemId(id) {
        return String(id || '').split('?')[0];
    }

    function inventoryItemsFrom(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
        if (typeof value !== 'object') return [];
        return Object.entries(value)
            .filter(([, item]) => item && typeof item === 'object')
            .map(([id, item]) => ({ ...item, id: item.id || id }));
    }

    function rememberCommanderItem(item) {
        const id = baseItemId(item && item.id);
        if (!id) return true;

        const data = itemData.get(id);
        if (!data) return false;
        if (data.type !== 'commander') return true;

        const health = number(item.properties && item.properties.health);
        const rememberedHealth = health == null ? data.health : health;
        if (rememberedHealth == null) return true;
        commanderHpById.set(id, {
            health: rememberedHealth,
            updatedAt: Date.now()
        });
        return true;
    }

    function rememberInventoryItems(value) {
        for (const item of inventoryItemsFrom(value)) {
            if (!rememberCommanderItem(item) && baseItemId(item.id).startsWith('a.')) pendingInventoryItems.push(item);
        }
    }

    function rememberCommanderResults(results) {
        for (const item of inventoryItemsFrom(results)) rememberCommanderItem(item);
    }

    function formationTroopSlots(formation) {
        const troops = formation && (formation.troops || formation.DTO && formation.DTO.troops);
        if (Array.isArray(troops)) return troops.filter(slot => slot && typeof slot === 'object');
        if (troops && typeof troops === 'object') return Object.values(troops).filter(slot => slot && typeof slot === 'object');
        return [];
    }

    function troopQtySnapshotFromFormation(formation) {
        const snapshot = new Map();
        for (const slot of formationTroopSlots(formation)) {
            const id = baseItemId(slot.id);
            if (!id) continue;
            const current = snapshot.get(id) || { qty: 0, slots: 0 };
            current.qty += number(slot.qty) || 0;
            current.slots += 1;
            snapshot.set(id, current);
        }
        return snapshot;
    }

    function rememberActiveFormation(formation) {
        const snapshot = troopQtySnapshotFromFormation(formation);
        if (!snapshot.size) return;
        activeTroopQtyById.clear();
        for (const [id, value] of snapshot) {
            activeTroopQtyById.set(id, {
                qty: value.qty,
                slots: value.slots,
                updatedAt: Date.now()
            });
        }
        try {
            sessionStorage.setItem('dotvCombatLogPlusActiveTroops', JSON.stringify([...activeTroopQtyById]));
        } catch { }
    }

    function rememberEffects(effects) {
        if (!Array.isArray(effects)) return;
        reserveCapBonus = effects
            .filter(effect => norm(effect && effect.type) === 'reservecap')
            .reduce((total, effect) => total + (number(effect.amount) || 0), 0);
        try {
            sessionStorage.setItem('dotvCombatLogPlusReserveCapBonus', JSON.stringify(reserveCapBonus));
        } catch { }
    }

    function rememberProfileState(data) {
        rememberEffects(data && data.profileData && data.profileData.userEffects);
        rememberEffects(data && data.payload && data.payload.profileData && data.payload.profileData.userEffects);
        const formations = data && data.profileData && data.profileData.formations
            || data && data.payload && data.payload.profileData && data.payload.profileData.formations
            || data && data.payload && data.payload.formations
            || data && data.formations;
        const active = Array.isArray(formations) ? formations.find(formation => formation && formation.active) : null;
        if (active) rememberActiveFormation(active);
    }

    function rememberFormationSave(data, requestBody) {
        if (data && data.success === false) return;
        const payload = data && data.payload || {};
        rememberEffects(payload.effects);
        rememberEffects(data && data.effects);

        const candidates = [
            payload.formation,
            payload.userFormation,
            payload.updatedFormation,
            payload.savedFormation,
            data && data.formation,
            data && data.userFormation,
            data && data.updatedFormation,
            parseRequestBody(requestBody)
        ];

        for (const formation of candidates) {
            if (formation && formationTroopSlots(formation).length) {
                rememberActiveFormation(formation);
                return;
            }
        }
    }

    function restoreFormationState() {
        try {
            const storedTroops = JSON.parse(sessionStorage.getItem('dotvCombatLogPlusActiveTroops') || '[]');
            if (Array.isArray(storedTroops)) {
                activeTroopQtyById.clear();
                for (const [id, value] of storedTroops) {
                    if (id && value && typeof value === 'object') activeTroopQtyById.set(id, value);
                }
            }
        } catch { }
        try {
            const storedReserve = number(JSON.parse(sessionStorage.getItem('dotvCombatLogPlusReserveCapBonus') || '0'));
            reserveCapBonus = storedReserve || 0;
        } catch { }
    }

    function troopReserveCap(id, slots) {
        const reserve = number((itemData.get(baseItemId(id)) || {}).reserve);
        if (reserve == null) return null;
        return (reserve + reserveCapBonus) * Math.max(1, slots || 1);
    }

    function retryPendingInventoryItems() {
        if (!pendingInventoryItems.length) return;
        const items = pendingInventoryItems.splice(0);
        for (const item of items) {
            if (!rememberCommanderItem(item) && baseItemId(item.id).startsWith('a.')) pendingInventoryItems.push(item);
        }
    }

    function rememberRaidData(id, raid) {
        if (!raid || typeof raid !== 'object' || !Array.isArray(raid.difficulties)) return false;
        const raidId = String(raid.id || id || '').trim();
        if (!raidId) return false;
        raidDataById.set(raidId, raid);
        return true;
    }

    function rememberRaidBatchData(data) {
        const roots = [data, data && data.payload, data && data.raids, data && data.data].filter(Boolean);
        for (const root of roots) {
            if (Array.isArray(root)) {
                root.forEach(raid => rememberRaidData(raid && raid.id, raid));
            } else if (root && typeof root === 'object') {
                for (const [id, raid] of Object.entries(root)) rememberRaidData(id, raid);
            }
        }
    }

    function rememberUserRaidData(value, depth = 0, seen = new Set()) {
        if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return;
        seen.add(value);

        if (!Array.isArray(value) && value.id != null && value.raidXmlId && value.difficulty) {
            userRaidById.set(String(value.id), {
                id: value.id,
                raidXmlId: String(value.raidXmlId),
                difficulty: difficulty(value.difficulty),
                name: value.name || '',
                isQuest: Boolean(value.isquest ?? value.isQuest)
            });
        }

        const children = Array.isArray(value) ? value : Object.values(value);
        for (const child of children) rememberUserRaidData(child, depth + 1, seen);
    }

    function getRaidContext() {
        const raid = document.querySelector('.raid-container');
        const nameEl = raid && raid.querySelector('.boss-name-container span');
        if (!raid || !nameEl) return null;

        const types = (raid.querySelector('.raid-header .misc') || {}).textContent || '';
        const header = (raid.querySelector('.raid-header') || {}).textContent || '';
        const isQuest = !/\bguild\b/i.test(types) && !/Leaderboard|Loot|Community Tiers|Guild Tiers/i.test(header);
        const category = isQuest ? 'QUEST' : /\bguild\b/i.test(types) ? 'GUILD' : /world raid/i.test(types) ? 'WR' : /event raid/i.test(types) ? 'ER' : 'PUBLIC';

        return {
            category,
            name: nameEl.textContent.trim(),
            difficulty: difficulty(nameEl.className)
        };
    }

    function raidCategory(raid, diff) {
        if (raid && raid.guildRaid) return 'GUILD';
        if (diff && diff.quest) return 'QUEST';
        const races = Array.isArray(raid && raid.races) ? raid.races.map(norm) : [];
        if (races.includes('guild raid')) return 'GUILD';
        if (races.includes('world raid')) return 'WR';
        if (races.includes('event raid')) return 'ER';
        return raid && raid.timedRaid ? 'TIMED' : 'PUBLIC';
    }

    function getDifficultyData(raid, diffId, preferQuest) {
        if (!raid || !Array.isArray(raid.difficulties)) return null;
        const rawId = String(diffId || '').toLowerCase();
        const exact = raid.difficulties.filter(item => String(item.id || '').toLowerCase() === rawId);
        if (preferQuest != null) {
            const exactPreferred = exact.find(item => Boolean(item.quest) === preferQuest);
            if (exactPreferred) return exactPreferred;
        }

        const matches = raid.difficulties.filter(item => difficulty(item.id) === difficulty(diffId));
        if (preferQuest != null) {
            const preferred = matches.find(item => Boolean(item.quest) === preferQuest);
            if (preferred) return preferred;
        }
        if (exact[0]) return exact[0];
        return matches.find(item => !item.quest) || matches[0] || null;
    }

    function numericWord(value) {
        const text = String(value || '').toLowerCase();
        if (/^\d+$/.test(text)) return Number(text);
        return {
            one: 1,
            two: 2,
            three: 3,
            four: 4,
            five: 5,
            six: 6,
            seven: 7,
            eight: 8,
            nine: 9,
            ten: 10
        }[text] || null;
    }

    function parseExtraAttackCount(text) {
        const raw = String(text || '');
        const patterns = [
            /\bgets\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+extra attacks?\b/i,
            /\battack\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+extra times\b/i,
            /\bfollowed by\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+weaker attacks?\b/i
        ];
        for (const pattern of patterns) {
            const match = raw.match(pattern);
            const parsed = match && numericWord(match[1]);
            if (parsed != null) return parsed;
        }
        return 0;
    }

    function buildRaidAbilities(diff) {
        const ids = Array.isArray(diff && diff.raidAbility) ? diff.raidAbility : [];
        const texts = Array.isArray(diff && diff.raidAbilityText) ? diff.raidAbilityText : [];
        return ids.map((id, index) => {
            const text = texts[index] || texts.find(item => norm(item && item.name) === norm(id)) || {};
            const name = String(text.name || id || '').trim();
            const desc = String(text.desc || '').trim();
            return {
                id: String(id || '').trim(),
                name,
                desc,
                chance: /\bchance\b/i.test(desc),
                extraAttacks: parseExtraAttackCount(desc)
            };
        });
    }

    function buildRaidEntry(raid, diffId, attackType, preferQuest) {
        const diff = getDifficultyData(raid, diffId, preferQuest);
        const base = number(diff && (diff.dmgval ?? diff.baseDmg ?? diff.damageToPlayer));
        const count = number(attackType) || 20;
        return {
            raidId: raid && raid.id,
            name: raid && raid.name || '',
            difficulty: diff && difficulty(diff.id) || difficulty(diffId),
            category: raidCategory(raid, diff),
            damageType: String(raid && raid.damageType || '').trim(),
            baseDamage: base == null ? null : base * count,
            baseValue: base,
            attackType: count,
            raidAbilities: buildRaidAbilities(diff)
        };
    }

    function getAttackRequestInfo(rawAttack, requestBody) {
        const request = parseRequestBody(requestBody) || {};
        return {
            raidId: request.raidId
                ?? request.userRaidId
                ?? request.id
                ?? rawAttack?.raidId
                ?? rawAttack?.userRaidId
                ?? rawAttack?.raid?.id
                ?? rawAttack?.userRaid?.id
                ?? rawAttack?.request?.raidId
                ?? rawAttack?.request?.userRaidId
                ?? rawAttack?.payload?.raidId
                ?? rawAttack?.payload?.userRaidId
                ?? rawAttack?.payload?.raid?.id
                ?? rawAttack?.payload?.userRaid?.id
                ?? rawAttack?.damage?.raidId
                ?? rawAttack?.damage?.userRaidId,
            attackType: request.attackType
                ?? rawAttack?.attackType
                ?? rawAttack?.attacks
                ?? rawAttack?.attackCount
                ?? rawAttack?.request?.attackType
                ?? rawAttack?.request?.attacks
                ?? rawAttack?.request?.attackCount
                ?? rawAttack?.payload?.attackType
                ?? rawAttack?.payload?.attacks
                ?? rawAttack?.payload?.attackCount
                ?? rawAttack?.damage?.attackType
                ?? rawAttack?.damage?.attacks
                ?? rawAttack?.damage?.attackCount
        };
    }

    function findRaidEntry(rawAttack, requestBody) {
        const attack = getAttackRequestInfo(rawAttack, requestBody);
        const userRaid = attack.raidId != null ? userRaidById.get(String(attack.raidId)) : null;
        if (userRaid) {
            const raid = raidDataById.get(userRaid.raidXmlId);
            if (raid) return buildRaidEntry(raid, userRaid.difficulty, attack.attackType, userRaid.isQuest);
        }

        const context = getRaidContext();
        if (!context) return null;

        const matches = [...raidDataById.values()]
            .map(raid => ({ raid, diff: getDifficultyData(raid, context.difficulty, context.category === 'QUEST') }))
            .filter(({ raid, diff }) => diff && norm(raid.name) === norm(context.name));
        const match = matches.find(item => raidCategory(item.raid, item.diff) === context.category)
            || (context.category === 'PUBLIC' && matches.find(item => raidCategory(item.raid, item.diff) === 'TIMED'))
            || matches.find(item => raidCategory(item.raid, item.diff) === 'PUBLIC')
            || matches[0];

        return match ? buildRaidEntry(match.raid, context.difficulty, attack.attackType, context.category === 'QUEST') : null;
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .dotv-clp-controls {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                float: right;
                margin-left: auto;
                margin-right: 14px;
                color: #d6a07f;
                font: 13px/1.1 Georgia, Cambria, 'Times New Roman', serif;
                vertical-align: middle;
            }
            .dotv-clp-tool-button {
                all: initial;
                box-sizing: border-box;
                min-width: 28px;
                height: 22px;
                padding: 2px 7px;
                border: 1px solid rgba(180, 123, 99, 0.7);
                border-radius: 3px;
                background: rgba(0, 0, 0, 0.65);
                color: #d6a07f;
                cursor: pointer;
                font: 12px/16px Georgia, Cambria, 'Times New Roman', serif;
                text-align: center;
                vertical-align: middle;
            }
            .dotv-clp-tool-button:hover,
            .dotv-clp-tool-button:focus {
                border-color: #ffd166;
                color: #ffd166;
            }
            .dotv-clp-gear-button {
                position: relative;
                min-width: 72px;
                padding: 2px 7px 2px 24px;
                border-color: rgba(130, 130, 130, 0.75);
                color: #9a9a9a;
                font: 12px/16px Georgia, Cambria, 'Times New Roman', serif;
            }
            .dotv-clp-gear-button::before {
                content: "\\2699";
                position: absolute;
                left: 7px;
                top: 1px;
                font: 15px/18px Arial, sans-serif;
            }
            .dotv-clp-gear-button:hover,
            .dotv-clp-gear-button:focus {
                border-color: #b8b8b8;
                color: #c8c8c8;
            }
            .dotv-clp-toggle {
                all: initial;
                display: inline-block;
                box-sizing: border-box;
                min-width: 14px;
                height: 14px;
                margin-right: 4px;
                border: 1px solid #9f6a55;
                border-radius: 2px;
                background: rgba(0, 0, 0, 0.65);
                color: #ffd166;
                cursor: pointer;
                font: 10px/12px Arial, sans-serif;
                text-align: center;
                vertical-align: 1px;
            }
            .dotv-clp-toggle:hover { border-color: #d6a07f; }
            .dotv-clp-settings {
                position: fixed;
                z-index: 2147483001;
                box-sizing: border-box;
                min-width: 220px;
                padding: 8px 9px;
                border: 1px solid rgba(180, 123, 99, 0.95);
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.94);
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.7);
                color: #d6a07f;
                font: 12px/1.25 Georgia, Cambria, 'Times New Roman', serif;
            }
            .dotv-clp-setting-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin: 5px 0;
            }
            .dotv-clp-setting-row label {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
            }
            .dotv-clp-setting-row input[type="checkbox"] {
                width: 13px;
                height: 13px;
                margin: 0;
            }
            .dotv-clp-setting-row input[type="number"] {
                width: 64px;
                box-sizing: border-box;
                border: 1px solid #8c604f;
                border-radius: 2px;
                background: #090909;
                color: #d6a07f;
                font: 12px/1.2 Arial, sans-serif;
            }
            .battle-log-container {
                box-sizing: border-box;
                width: var(--dotv-clp-log-width, 420px);
                min-width: min(420px, 100%);
                max-width: none;
                scrollbar-gutter: stable;
                overflow-x: hidden !important;
                overflow-y: scroll !important;
            }
            .battle-log-container.dotv-clp-enhanced-view {
                overflow-x: hidden !important;
            }
            .dotv-clp-enhanced-shell {
                box-sizing: border-box;
                display: block;
                align-self: flex-start;
                width: max-content;
                min-width: 0;
                max-width: none;
                margin: 0;
                padding: 0;
                color: orange;
                contain: layout;
            }
            .dotv-clp-enhanced-shell[hidden] {
                display: none !important;
            }
            .dotv-clp-enhanced-log {
                box-sizing: border-box;
                width: max-content;
                min-width: 0;
                max-width: none;
                min-height: 24px;
                max-height: none;
                overflow: visible;
                padding: 2px;
                border: 0;
                border-radius: 0;
                background: transparent;
                color: orange;
            }
            .dotv-clp-hit-card {
                box-sizing: border-box;
                width: max-content;
                min-width: 0;
                max-width: none;
                margin: 4px 0;
                padding: 4px 6px;
                border: 1px solid rgba(180, 123, 99, 0.55);
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.22);
                color: orange;
            }
            .dotv-clp-enhanced-row {
                width: max-content;
                max-width: none;
                min-height: 15px;
                color: orange;
                white-space: nowrap;
                overflow-wrap: normal;
            }
            .dotv-clp-enhanced-row.dotv-clp-main-row {
                color: orange;
            }
            .dotv-clp-enhanced-row.dotv-clp-section-row {
                margin-top: 2px;
            }
            .dotv-clp-enhanced-details[hidden] {
                display: none !important;
            }
            .battle-log-container.dotv-clp-enhanced-view > div:not(.dotv-clp-enhanced-shell) {
                display: none !important;
            }
            .dotv-clp-panel {
                margin: 2px 0 4px 16px;
                padding: 3px 6px;
                border-left: 2px solid #9f8a5a;
                color: #f0cf83;
                background: rgba(28, 20, 7, 0.32);
                font-family: 'Segoe UI', Arial, sans-serif;
                font-variant-numeric: lining-nums tabular-nums;
                font-feature-settings: "lnum" 1, "tnum" 1;
                width: max-content;
                max-width: none;
                white-space: nowrap;
            }
            .dotv-clp-panel[hidden] { display: none !important; }
            .dotv-clp-lines {
                display: grid;
                grid-template-columns: max-content max-content max-content;
                column-gap: 8px;
                row-gap: 1px;
                margin-top: 3px;
                white-space: nowrap;
            }
            .dotv-clp-label { color: #d7ad6b; }
            .dotv-clp-value { color: #ffe0a0; }
            .dotv-clp-note { color: #cdbd8b; white-space: nowrap; }
            .dotv-clp-percent {
                color: #ffe0a0;
                font-weight: 600;
                font-family: 'Segoe UI', Arial, sans-serif;
                font-variant-numeric: lining-nums tabular-nums;
                font-feature-settings: "lnum" 1, "tnum" 1;
            }
        `;
        document.head.appendChild(style);
    }

    function formatItemName(idOrName) {
        const data = itemData.get(baseItemId(idOrName));
        if (data && data.name) return data.name;
        const raw = baseItemId(idOrName).split('.').pop();
        return raw.split('-').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Unknown';
    }

    function modName(mod) {
        if (mod.text && !/^\s*$/.test(mod.text)) return mod.text.replace(/[.!]\s*$/, '');
        return formatItemName(mod.effectName || mod.itemId);
    }

    function isPlayerDamageReductionMod(mod) {
        return mod && (
            mod.type === 'damagetoplayerreductionpercent' ||
            mod.type === 'blockdmgpercent' ||
            mod.type === 'blockdamagepercent'
        );
    }

    function playerDamageReductionName(mod) {
        return mod && (mod.type === 'blockdmgpercent' || mod.type === 'blockdamagepercent') ? 'Block' : modName(mod);
    }

    function isEvadablePlayerDamageMod(mod) {
        const value = mod && mod.evadable;
        return value === true || String(value).toLowerCase() === 'true';
    }

    function isRepeatedBaseRaidAttackMod(mod) {
        const text = norm([
            mod && mod.effectName,
            mod && mod.itemId,
            mod && mod.text,
            mod && modName(mod)
        ].filter(Boolean).join(' '));
        return text.includes('multistrike') || text.includes('psychedelic stumble');
    }

    function isExtraRaidAttackMod(mod) {
        const text = norm([
            mod && mod.effectName,
            mod && mod.itemId,
            mod && mod.text,
            mod && modName(mod)
        ].filter(Boolean).join(' '));
        return isRepeatedBaseRaidAttackMod(mod) || text.includes('flurried frenzy');
    }

    function abilityModMatches(mod, ability) {
        const text = norm([
            mod && mod.effectName,
            mod && mod.itemId,
            mod && mod.text,
            mod && modName(mod)
        ].filter(Boolean).join(' '));
        const keys = [ability && ability.id, ability && ability.name]
            .map(norm)
            .filter(Boolean);
        return keys.some(key => text.includes(key));
    }

    function matchingRaidAbility(mod, raid) {
        return (raid && raid.raidAbilities || []).find(ability => abilityModMatches(mod, ability)) || null;
    }

    function isRaidAbilityPlayerDamageMod(mod, raid) {
        if (!mod || mod.type !== 'damagetoplayer') return false;
        if (mod.damageType) return true;
        if (isExtraRaidAttackMod(mod)) return true;
        return !!matchingRaidAbility(mod, raid);
    }

    function isExtraAttackPlayerDamageMod(mod, raid) {
        if (!mod || mod.type !== 'damagetoplayer') return false;
        const ability = matchingRaidAbility(mod, raid);
        return isExtraRaidAttackMod(mod) || !!(ability && ability.extraAttacks);
    }

    function isRepeatedBaseAttackGroup(group) {
        if (!group) return false;
        return (group.mods || []).some(isRepeatedBaseRaidAttackMod);
    }

    function hasRaidAbility(raid, abilityName) {
        const target = norm(abilityName);
        return (raid && raid.raidAbilities || []).some(ability => norm(ability && ability.id) === target || norm(ability && ability.name) === target);
    }

    function coordinatedMagicAlterationMod(damage, raid) {
        if (!hasRaidAbility(raid, 'coordinated')) return null;
        return (damage && damage.mods || []).find(mod => mod && mod.type === COORDINATED_ALTERATION_TYPE) || null;
    }

    function hasCoordinatedMagicAlteration(damage, raid) {
        return !!coordinatedMagicAlterationMod(damage, raid);
    }

    function attackDamageType(rawAttack, damage, raid) {
        return damageTypeName(damage && damage.damageType)
            || damageTypeName(damage && damage.itemType)
            || damageTypeName(rawAttack && rawAttack.damageType)
            || (hasCoordinatedMagicAlteration(damage, raid) ? 'magic' : '')
            || damageTypeName(raid && raid.damageType);
    }

    function attackBaseDamage(damage, raid) {
        const base = number(raid && raid.baseDamage);
        if (base == null) return null;
        const coordinated = coordinatedMagicAlterationMod(damage, raid);
        const alteration = normalizePercent(coordinated && coordinated.amount);
        return coordinated && alteration != null && alteration > -1 ? base / (1 + alteration) : base;
    }

    function currentResistance(damage, damageType) {
        const attackResistances = (damage && damage.mods || []).filter(mod => mod && mod.type === 'resistance');
        return getResistanceEntry(mergeResistanceSources(attackResistances, statsSnapshot && statsSnapshot.resistances), damageType);
    }

    function defenseText() {
        return statsSnapshot && Number.isFinite(statsSnapshot.defense)
            ? ` ${formatNumber(statsSnapshot.defense)}`
            : '';
    }

    function playerReductionFactor(reductionMods) {
        return reductionMods.reduce((factor, mod) => {
            const reduction = normalizePercent(mod.amount);
            return reduction == null ? factor : factor * (1 - reduction);
        }, 1);
    }

    function groupPlayerDamageMods(mods, raid, fallbackDamageType) {
        const groups = new Map();
        for (const mod of mods) {
            const ability = matchingRaidAbility(mod, raid);
            const label = modName(mod);
            const type = String(mod.damageType || fallbackDamageType || raid && raid.damageType || '').trim();
            const key = `${norm(label)}|${norm(type)}`;
            const existing = groups.get(key) || {
                label,
                type,
                amount: 0,
                count: 0,
                expected: ability && ability.extraAttacks || 0,
                ability: ability || null,
                mods: []
            };
            if (!existing.ability && ability) existing.ability = ability;
            existing.amount += number(mod.amount) || 0;
            existing.count += 1;
            existing.mods.push(mod);
            groups.set(key, existing);
        }
        return [...groups.values()];
    }

    function buildSilentExtraAttackEvades(raid, damage) {
        const mods = damage && Array.isArray(damage.mods) ? damage.mods : [];
        const playerDamageMods = mods.filter(mod => mod && mod.type === 'damagetoplayer');
        const evades = [];

        for (const ability of raid && raid.raidAbilities || []) {
            if (!ability.extraAttacks) continue;
            const observed = playerDamageMods.filter(mod => abilityModMatches(mod, ability)).length;
            if (observed >= ability.extraAttacks) continue;
            if (ability.chance && observed === 0) continue;
            evades.push({
                key: norm(ability.id || ability.name),
                abilityName: ability.name || formatItemName(ability.id),
                count: ability.extraAttacks - observed,
                expected: ability.extraAttacks,
                observed
            });
        }

        return evades;
    }

    function isAttackUrl(url) {
        try {
            return new URL(url, location.origin).pathname === ATTACK_PATH;
        } catch {
            return String(url || '').includes(ATTACK_PATH);
        }
    }

    function isStatsUrl(url) {
        try {
            return new URL(url, location.origin).pathname === USER_STATS_PATH;
        } catch {
            return String(url || '').includes(USER_STATS_PATH);
        }
    }

    function getPath(url) {
        try {
            return new URL(url, location.origin).pathname;
        } catch {
            return '';
        }
    }

    function isRaidListUrl(path) {
        return path === '/api/raid/active'
            || path === '/api/raid/public'
            || path === '/api/raid/guild/active'
            || path === '/api/raid/active/paginated'
            || path === '/api/raid/public/paginated'
            || path === '/api/raid/unjoined/paginated'
            || path === '/api/quest/openbossnode'
            || path.startsWith('/api/raid/join/');
    }

    function shouldInspectUrl(url) {
        const path = getPath(url);
        if (path) {
            return path === ATTACK_PATH
                || path === RAID_ABILITY_PATH
                || path === USER_INFO_PATH
                || path.startsWith(USER_STATS_PATH)
                || path === STARTUP_BATCH_PATH
                || path === RAID_BATCH_PATH
                || path.startsWith(ARMY_CAMP_PREFIX)
                || path === FORMATION_SAVE_PATH
                || isRaidListUrl(path);
        }
        const text = String(url || '');
        return text.includes(ATTACK_PATH)
            || text.includes(RAID_ABILITY_PATH)
            || text.includes(USER_INFO_PATH)
            || text.includes(USER_STATS_PATH)
            || text.includes(STARTUP_BATCH_PATH)
            || text.includes(RAID_BATCH_PATH)
            || text.includes(ARMY_CAMP_PREFIX)
            || text.includes(FORMATION_SAVE_PATH)
            || text.includes('/api/raid/active')
            || text.includes('/api/raid/public')
            || text.includes('/api/raid/join/')
            || text.includes('/api/quest/openbossnode');
    }

    function normalizePercent(value) {
        const parsed = number(value);
        if (parsed == null) return null;
        return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
    }

    function statObjectCandidate(value) {
        return value
            && typeof value === 'object'
            && !Array.isArray(value)
            && number(value.defense) != null
            && Array.isArray(value.resistances);
    }

    function findStatObject(value, depth = 0, seen = new Set()) {
        if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return null;
        seen.add(value);
        if (statObjectCandidate(value)) return value;

        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findStatObject(item, depth + 1, seen);
                if (found) return found;
            }
            return null;
        }

        for (const key of ['payload', 'statData', 'stats', 'updatedPlayerStats', 'userStats', 'data']) {
            const found = findStatObject(value[key], depth + 1, seen);
            if (found) return found;
        }

        for (const item of Object.values(value)) {
            const found = findStatObject(item, depth + 1, seen);
            if (found) return found;
        }
        return null;
    }

    function rememberStats(stats, source) {
        if (!stats) return;
        statsSnapshot = {
            defense: number(stats.defense),
            resistances: stats.resistances,
            source,
            updatedAt: Date.now()
        };
        try {
            sessionStorage.setItem('dotvCombatLogPlusStats', JSON.stringify(statsSnapshot));
        } catch { }
    }

    function restoreStats() {
        try {
            const stored = JSON.parse(sessionStorage.getItem('dotvCombatLogPlusStats') || 'null');
            if (stored && Array.isArray(stored.resistances)) statsSnapshot = stored;
        } catch { }
    }

    function rememberStartupData(data) {
        const items = data && (data.items || data.payload && data.payload.items);
        if (!items || typeof items !== 'object') return;

        for (const [id, item] of Object.entries(items)) {
            if (!id || !item || typeof item !== 'object') continue;
            itemData.set(id, {
                name: item.name || formatItemName(id),
                type: item.type || '',
                health: number(item.health),
                reserve: number(item.reserve)
            });
        }
        retryPendingInventoryItems();
    }

    function rememberProfileInventory(data) {
        rememberInventoryItems(data && data.payload && data.payload.inventory && data.payload.inventory.items);
        rememberInventoryItems(data && data.payload && data.payload.user && data.payload.user.inventory);
        rememberInventoryItems(data && data.inventory && data.inventory.items);
    }

    function rememberInventoryUpdates(data) {
        rememberInventoryItems(data && data.payload && data.payload.items);
        rememberInventoryItems(data && data.payload && data.payload.updatedInventory);
        rememberInventoryItems(data && data.payload && data.payload.updatedInventoryItems);
        rememberInventoryItems(data && data.updatedItems);
        rememberInventoryItems(data && data.updatedInventory);
        rememberInventoryItems(data && data.updatedInventoryItems);
        rememberInventoryItems(data && data.itemResults);
        rememberInventoryItems(data && data.updatedPlayerStats && data.updatedPlayerStats.itemResults);
    }

    function resistanceSignature(entry) {
        if (!entry || typeof entry !== 'object') return '';
        const type = norm(entry.resistanceType || entry.damageType || entry.element || entry.type);
        const amount = normalizePercent(entry.amount);
        return [
            baseItemId(entry.itemId || entry.id || entry.key || ''),
            type,
            amount == null ? '' : String(amount)
        ].join('|');
    }

    function mergeResistanceSources(primary, secondary) {
        const merged = [];
        const seen = new Set();

        for (const source of [primary, secondary]) {
            if (Array.isArray(source)) {
                for (const entry of source) {
                    if (!entry || typeof entry !== 'object') continue;
                    const signature = resistanceSignature(entry);
                    if (signature && seen.has(signature)) continue;
                    if (signature) seen.add(signature);
                    merged.push(entry);
                }
            } else if (source && typeof source === 'object') {
                merged.push(source);
            }
        }

        return merged.length ? merged : null;
    }

    function getResistanceEntry(resistances, damageType) {
        const target = norm(damageType);
        if (!target || !resistances) return null;

        const readAmount = obj => {
            for (const key of ['amount', 'value', 'resist', 'resistance', 'percent', 'reduction']) {
                const value = normalizePercent(obj && obj[key]);
                if (value != null) return value;
            }
            return null;
        };
        const matchesType = entry => {
            if (!entry || typeof entry !== 'object') return false;
            for (const key of ['resistanceType', 'damageType', 'element', 'name', 'id', 'key']) {
                if (norm(entry[key]) === target) return true;
            }
            return norm(entry.type) === target
                || Object.entries(entry).some(([key, value]) => norm(key) === target || typeof value === 'string' && norm(value) === target);
        };

        if (Array.isArray(resistances)) {
            let total = 0;
            let found = false;
            for (const entry of resistances) {
                if (!entry || typeof entry !== 'object') continue;
                if (!matchesType(entry)) continue;
                const amount = readAmount(entry);
                if (amount == null) continue;
                total += amount;
                found = true;
            }
            return found ? total : null;
        } else if (typeof resistances === 'object') {
            for (const [key, value] of Object.entries(resistances)) {
                if (norm(key) === target) return typeof value === 'object' ? readAmount(value) : normalizePercent(value);
            }
        }
        return null;
    }

    function buildMagicProcs(damage) {
        const mods = damage && Array.isArray(damage.mods) ? damage.mods : [];
        const damageMods = mods.filter(mod => mod && mod.type === 'damage');
        const baseDamage = damageMods.reduce((total, mod) => total - (number(mod.amount) || 0), number(damage.totalDamage) || 0);

        return damageMods
            .filter(mod => String(mod.itemId || '').startsWith('m.'))
            .map(mod => ({
                type: 'damage',
                itemId: mod.itemId,
                name: formatItemName(mod.itemId),
                amount: number(mod.amount) || 0,
                amountText: formatNumber(number(mod.amount) || 0),
                percentText: baseDamage > 0 ? ((number(mod.amount) || 0) / baseDamage * 100).toFixed(2) : '0.00'
            }))
            .concat(mods
                .filter(mod => isPlayerDamageReductionMod(mod) && String(mod.itemId || '').startsWith('m.'))
                .map(mod => ({
                    type: 'playerDamageReduction',
                    itemId: mod.itemId,
                    name: playerDamageReductionName(mod),
                    amount: normalizePercent(mod.amount) || 0,
                    percentText: ((normalizePercent(mod.amount) || 0) * 100).toFixed(2)
                })));
    }

    function textModCandidates(mod) {
        const candidates = [];
        const text = String(mod && mod.text || '').trim();
        if (text) {
            candidates.push(text);
            candidates.push(text.endsWith('!') ? text : `${text}!`);
        }
        if (mod && mod.itemId === 'z.keen-eyes' && mod.effectName) {
            candidates.push(`You got ${formatItemName(mod.effectName)} x${formatNumber(number(mod.amount) || 0)}!`);
            candidates.push(`You got ${formatItemName(mod.effectName)} x${number(mod.amount) || 0}!`);
        }
        return [...new Set(candidates.map(norm).filter(Boolean))];
    }

    function buildTextMods(damage) {
        const mods = damage && Array.isArray(damage.mods) ? damage.mods : [];
        return mods
            .filter(mod => mod && mod.type === 'text' && baseItemId(mod.itemId) !== 'blockDamage')
            .map(mod => ({
                itemId: mod.itemId || '',
                candidates: textModCandidates(mod)
            }))
            .filter(mod => mod.candidates.length);
    }

    function troopQtyAfterLossResults(results) {
        const troops = new Map([...activeTroopQtyById].map(([id, value]) => [id, { ...value }]));
        for (const result of results || []) {
            const id = baseItemId(result && result.id);
            if (!id || (itemData.get(id) || {}).type !== 'troop') continue;
            const previous = troops.get(id);
            const loss = number(result.qty) || 0;
            if (previous && Number.isFinite(previous.qty)) {
                troops.set(id, {
                    ...previous,
                    qty: Math.max(0, previous.qty - loss)
                });
            }
        }
        return troops;
    }

    function commanderHpAfterResults(results) {
        const commanders = new Map();
        for (const result of results || []) {
            const id = baseItemId(result && result.id);
            if (!id || (itemData.get(id) || {}).type !== 'commander') continue;
            const health = number(result.properties && result.properties.health);
            if (health != null) commanders.set(id, { health });
        }
        return commanders;
    }

    function buildFormationBreakdown(damage, targetType, formation, options = {}) {
        const healing = !!options.healing;
        const resultKey = healing ? 'formationHealResults' : 'formationResults';
        const results = (damage && damage[resultKey] || []).filter(result => result && (number(result.qty) || 0) > 0);
        const armyReductions = healing ? [] : (damage && damage.mods || []).filter(mod => mod && mod.type === 'damagetoarmyreductionpercent');
        const targetRows = results.filter(result => (itemData.get(baseItemId(result.id)) || {}).type === targetType);
        if (!targetRows.length) return null;

        const lines = [];
        const currentTroops = targetType === 'troop' ? troopQtySnapshotFromFormation(formation) : null;

        for (const mod of armyReductions) {
            const reduction = normalizePercent(mod.amount);
            lines.push({
                label: 'Army Damage Reduction',
                change: `${modName(mod)}${reduction == null ? '' : ` -${pct(reduction)}`}`,
                result: ''
            });
        }

        for (const result of targetRows) {
            const id = baseItemId(result.id);
            const data = itemData.get(id) || {};
            if (targetType === 'troop') {
                const previous = options.previousTroopQtyById && options.previousTroopQtyById.get(id)
                    || activeTroopQtyById.get(id);
                const current = currentTroops && currentTroops.get(id);
                const slots = current && current.slots || previous && previous.slots || 1;
                const cap = troopReserveCap(id, slots);
                const formatQty = qty => cap == null
                    ? formatNumber(qty)
                    : `${formatNumber(qty)}/${formatNumber(cap)}`;
                const currentQty = current && Number.isFinite(current.qty) ? current.qty : null;
                const previousQty = previous && Number.isFinite(previous.qty) ? previous.qty : null;
                const qtyText = currentQty != null
                    ? previousQty != null
                        ? `${formatQty(previousQty)} -> ${formatQty(currentQty)}`
                        : formatQty(currentQty)
                    : '';
                const fainted = number(result.properties && result.properties.fainted);
                lines.push({
                    label: data.name || formatItemName(result.id),
                    change: qtyText ? `Qty ${qtyText}` : healing ? `Healed ${formatNumber(number(result.qty) || 0)}` : `Fainted ${formatNumber(fainted || 0)}`,
                    result: ''
                });
                continue;
            }

            const previousHealth = options.previousCommanderHpById && options.previousCommanderHpById.get(id)
                || commanderHpById.get(id);
            const currentHealth = number(result.properties && result.properties.health);
            const fainted = number(result.properties && result.properties.fainted);
            const loss = number(result.qty) || 0;
            const hadPreviousHealth = previousHealth && Number.isFinite(previousHealth.health);
            const maxHealth = data.health;
            const currentText = currentHealth != null
                ? `${statText(currentHealth)}${maxHealth != null ? `/${statText(maxHealth)}` : ''}`
                : '';
            const previousText = hadPreviousHealth
                ? `${statText(previousHealth.health)}${maxHealth != null ? `/${statText(maxHealth)}` : ''}`
                : '';
            const resultText = currentHealth != null
                ? hadPreviousHealth ? `${previousText} -> ${currentText}` : currentText
                : fainted != null
                    ? `${formatNumber(fainted)} fainted`
                    : '';
            lines.push({
                label: data.name || formatItemName(result.id),
                change: currentHealth != null ? `HP ${resultText}` : healing ? `Healed ${formatNumber(loss)}` : `Lost ${formatNumber(loss)}`,
                result: currentHealth != null ? '' : resultText
            });
        }

        return {
            summary: '',
            lines,
            notes: []
        };
    }

    function buildBreakdown(rawAttack, requestBody, matchedRaid) {
        const damage = rawAttack && rawAttack.damage;
        if (!damage) return null;

        const finalDamage = number(damage.damageToPlayer);
        const raid = matchedRaid || findRaidEntry(rawAttack, requestBody);
        const allReductionMods = (damage.mods || []).filter(isPlayerDamageReductionMod);
        const allPlayerDamageMods = (damage.mods || []).filter(mod => mod && mod.type === 'damagetoplayer');
        const baseDamageType = attackDamageType(rawAttack, damage, raid);
        const evadedPlayerDamageMods = damage.evadedAttack
            ? allPlayerDamageMods.filter(isEvadablePlayerDamageMod)
            : [];
        const activePlayerDamageMods = allPlayerDamageMods.filter(mod => !evadedPlayerDamageMods.includes(mod));
        const abilityPlayerDamageMods = activePlayerDamageMods.filter(mod => isRaidAbilityPlayerDamageMod(mod, raid));
        const extraAttackMods = abilityPlayerDamageMods.filter(mod => isExtraAttackPlayerDamageMod(mod, raid));
        const extraAttackSet = new Set(extraAttackMods);
        const bonusAbilityDamageMods = abilityPlayerDamageMods.filter(mod => !extraAttackSet.has(mod));
        const abilityDamageSet = new Set(abilityPlayerDamageMods);
        const directPlayerDamageMods = activePlayerDamageMods.filter(mod => !abilityDamageSet.has(mod));
        const directPlayerDamageTotal = directPlayerDamageMods.reduce((total, mod) => total + (number(mod.amount) || 0), 0);
        const reductionFactor = playerReductionFactor(allReductionMods);
        const lines = [];
        const notes = [];
        let baseBeforeDefence = 0;
        let baseHitBeforeDefence = null;
        let hasBaseDamage = false;
        const baseDamageValue = attackBaseDamage(damage, raid);

        if (raid && baseDamageValue != null) {
            lines.push({ label: `Base${baseDamageType ? ` ${titleCase(baseDamageType)}` : ''}`, change: '', result: formatPrecise(baseDamageValue) });
            let baseDamage = baseDamageValue;
            const resistance = currentResistance(damage, baseDamageType);
            if (resistance != null) {
                baseDamage *= 1 - resistance;
                lines.push({ label: `${titleCase(baseDamageType)} Resistance`, change: `-${pct(resistance)}`, result: formatPrecise(baseDamage) });
            }
            baseHitBeforeDefence = baseDamage;
            hasBaseDamage = true;
        } else if (raid) {
            notes.push('Base damage value was not present in the matched raid difficulty data.');
        } else {
            notes.push('Base damage unknown because the game raid-data batch has not been seen or this raid was not matched.');
        }

        for (const mod of allReductionMods) {
            const reduction = normalizePercent(mod.amount);
            if (reduction == null) continue;
            if (hasBaseDamage) baseHitBeforeDefence *= 1 - reduction;
            lines.push({
                label: playerDamageReductionName(mod),
                change: `-${pct(reduction)}`,
                result: hasBaseDamage ? formatPrecise(baseHitBeforeDefence) : '?'
            });
        }
        if (hasBaseDamage) {
            if (damage.evadedAttack) {
                lines.push({ label: 'Base Attack', change: '', result: 'attack evaded' });
            } else {
                baseBeforeDefence = baseHitBeforeDefence;
            }
        }

        let defendedHitCount = hasBaseDamage && !damage.evadedAttack ? 1 : 0;
        let defendedAbilityDamage = 0;
        let undefendedAbilityDamage = 0;
        const markedGroups = [
            ...groupPlayerDamageMods(bonusAbilityDamageMods, raid, baseDamageType).map(group => ({ ...group, kind: 'bonus' })),
            ...groupPlayerDamageMods(extraAttackMods, raid, baseDamageType).map(group => ({ ...group, kind: 'extra' }))
        ];
        for (const group of markedGroups) {
            if (group.amount <= 0) continue;
            const repeatedBaseAttack = group.kind === 'extra'
                && isRepeatedBaseAttackGroup(group)
                && Number.isFinite(baseHitBeforeDefence);
            const undefendedBonusAbility = group.kind === 'bonus';
            let adjusted = repeatedBaseAttack
                ? baseHitBeforeDefence * group.count
                : group.amount;
            const abilityLine = {
                label: `${group.label}${group.type ? ` ${titleCase(group.type)}` : ''}`,
                change: repeatedBaseAttack
                    ? formatHitSplit(adjusted, group.count)
                    : group.count > 1 ? formatHitSplit(group.amount, group.count) : formatDamage(group.amount),
                result: repeatedBaseAttack ? `${formatPrecise(adjusted)} before Defence` : ''
            };
            lines.push(abilityLine);
            if (repeatedBaseAttack) {
                defendedHitCount += group.count;
                defendedAbilityDamage += adjusted;
                continue;
            }
            const resistance = undefendedBonusAbility ? null : currentResistance(damage, group.type);
            if (resistance != null) {
                adjusted *= 1 - resistance;
                lines.push({ label: `${titleCase(group.type)} Resistance`, change: `-${pct(resistance)}`, result: formatPrecise(adjusted) });
            }
            if (undefendedBonusAbility) {
                adjusted *= reductionFactor;
                if (reductionFactor !== 1) abilityLine.result = formatPrecise(adjusted);
                undefendedAbilityDamage += adjusted;
            } else if (group.kind === 'extra') {
                adjusted *= reductionFactor;
                if (reductionFactor !== 1) abilityLine.result = formatPrecise(adjusted);
                undefendedAbilityDamage += adjusted;
            } else {
                undefendedAbilityDamage += adjusted;
            }
        }

        const damageBeforeDefence = baseBeforeDefence + defendedAbilityDamage;
        const observedDamageBeforeDefence = finalDamage == null
            ? null
            : Math.max(0, finalDamage - directPlayerDamageTotal - undefendedAbilityDamage);

        if (observedDamageBeforeDefence > 0 && damageBeforeDefence > 0) {
            const highDamage = observedDamageBeforeDefence;
            const lowDamage = Math.max(0, observedDamageBeforeDefence - 1);
            const lowReduction = Math.max(0, 1 - highDamage / damageBeforeDefence);
            const highReduction = 1 - lowDamage / damageBeforeDefence;
            const canSplitDefendedHits = defendedHitCount > 1
                && Number.isFinite(baseHitBeforeDefence)
                && Math.abs(damageBeforeDefence - baseHitBeforeDefence * defendedHitCount) < 1e-6;
            lines.push({
                label: `Defence${defenseText()}`,
                change: pctRange(lowReduction, highReduction),
                result: canSplitDefendedHits
                    ? `${formatHitSplit(observedDamageBeforeDefence, defendedHitCount)} (${formatDamage(observedDamageBeforeDefence)} total)`
                    : formatPrecise(observedDamageBeforeDefence)
            });
        }

        if (damage.evadedAttack && (!observedDamageBeforeDefence || observedDamageBeforeDefence <= 0)) {
            lines.push({
                label: 'Final',
                change: '',
                result: 'attack evaded'
            });
        }

        for (const mod of directPlayerDamageMods) {
            lines.push({
                label: `${modName(mod)} To You`,
                change: `+${formatNumber(number(mod.amount) || 0)}`,
                result: ''
            });
        }

        for (const mod of evadedPlayerDamageMods) {
            lines.push({
                label: modName(mod),
                change: formatDamage(number(mod.amount) || 0),
                result: 'evaded'
            });
        }

        if (finalDamage != null && (abilityPlayerDamageMods.length > 0 || directPlayerDamageTotal > 0)) {
            lines.push({
                label: 'Final Taken',
                change: '',
                result: formatNumber(finalDamage)
            });
        }

        if (!lines.length && !notes.length) return null;
        return {
            finalDamage: finalDamage || 0,
            finalDamageText: formatNumber(finalDamage || 0),
            summary: '',
            lines,
            notes,
            createdAt: Date.now()
        };
    }

    function handleAttackResponse(data, requestBody) {
        const damage = data && data.damage;
        if (!damage) return;
        rememberEffects(data && data.effects);
        const raid = findRaidEntry(data, requestBody);
        const breakdown = buildBreakdown(data, requestBody, raid);
        const troopBreakdown = buildFormationBreakdown(damage, 'troop', data && data.formation);
        const commanderBreakdown = buildFormationBreakdown(damage, 'commander', data && data.formation);
        const troopHealBreakdown = buildFormationBreakdown(damage, 'troop', data && data.formation, {
            healing: true,
            previousTroopQtyById: troopQtyAfterLossResults(damage.formationResults)
        });
        const commanderHealBreakdown = buildFormationBreakdown(damage, 'commander', data && data.formation, {
            healing: true,
            previousCommanderHpById: commanderHpAfterResults(damage.formationResults)
        });
        const magicProcs = buildMagicProcs(damage);
        const textMods = buildTextMods(damage);
        const syntheticEvades = buildSilentExtraAttackEvades(raid, damage);
        rememberCommanderResults(damage.formationResults);
        rememberCommanderResults(damage.formationHealResults);
        pendingHits.push({
            id: `clp-${Date.now()}-${++hitSeq}`,
            totalDamageText: formatNumber(number(damage.totalDamage) || 0),
            damageBreakdown: breakdown,
            troopBreakdown,
            commanderBreakdown,
            troopHealBreakdown,
            commanderHealBreakdown,
            magicProcs,
            textMods,
            syntheticEvades,
            createdAt: Date.now()
        });
        rememberActiveFormation(data && data.formation);
        scheduleApply();
        setTimeout(applyPendingSafely, 50);
        setTimeout(applyPendingSafely, 250);
        setTimeout(applyPendingSafely, 1000);
        setTimeout(applyPendingSafely, PENDING_TTL_MS + 100);
    }

    function handleResponse(url, data, requestBody) {
        const path = getPath(url);
        if (path === STARTUP_BATCH_PATH) rememberStartupData(data);
        if (path === RAID_BATCH_PATH) rememberRaidBatchData(data);
        if (path === USER_INFO_PATH) {
            rememberProfileInventory(data);
            rememberProfileState(data);
        }
        if (path.startsWith(ARMY_CAMP_PREFIX)) rememberInventoryUpdates(data);
        if (path === FORMATION_SAVE_PATH) rememberFormationSave(data, requestBody);
        if (path === ATTACK_PATH || isRaidListUrl(path)) rememberUserRaidData(data);
        if (path !== RAID_BATCH_PATH && path !== STARTUP_BATCH_PATH) {
            const stats = findStatObject(data);
            if (stats) rememberStats(stats, isStatsUrl(url) ? USER_STATS_PATH : 'piggyback');
        }
        if (isAttackUrl(url)) handleAttackResponse(data, requestBody);
        if (path === RAID_ABILITY_PATH) {
            const damage = data && data.damage;
            rememberCommanderResults(damage && damage.formationResults);
            rememberCommanderResults(damage && damage.formationHealResults);
        }
    }

    function cleanText(node) {
        return (node && node.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function normalizedText(node) {
        return cleanText(node).replace(/['\u2019]/g, '').toLowerCase();
    }

    function isHitStartLine(entry, hit) {
        const text = cleanText(entry);
        if (hit) {
            return text.includes(`did ${hit.totalDamageText} damage`)
                || text.includes(`crit ${hit.totalDamageText} damage`)
                || text.includes(`CRIT ${hit.totalDamageText}`);
        }
        return /\b(?:did|crit) [\d,]+ damage\b/.test(text) || /\bCRIT [\d,]+\b/.test(text);
    }

    function isDamageTakenLine(entry, breakdown) {
        if (!breakdown) return false;
        return cleanText(entry).includes(`strikes you for ${breakdown.finalDamageText} damage`);
    }

    function isEvasionLine(entry) {
        return /nimbly evaded .* attack!$/i.test(cleanText(entry));
    }

    function isCommanderInjuryLine(entry) {
        return cleanText(entry).includes('Your Commanders were injured from that last attack!');
    }

    function isTroopLossLine(entry) {
        return cleanText(entry).includes('Your armies suffered Troop losses from that last attack!');
    }

    function isFormationHealLine(entry) {
        return isTroopHealLine(entry) || isCommanderHealLine(entry);
    }

    function isArmyEventLine(entry) {
        return isTroopLossLine(entry) || isCommanderInjuryLine(entry) || isFormationHealLine(entry);
    }

    function isTroopHealLine(entry) {
        return cleanText(entry).includes('Your Troops were healed!');
    }

    function isCommanderHealLine(entry) {
        return cleanText(entry).includes('Your Commanders were healed!');
    }

    function isPlayerHealLine(entry) {
        const text = cleanText(entry);
        return /\brestored\s+[\d,.]+\s+of your Health\b/i.test(text)
            || /\bhealed you\b/i.test(text);
    }

    function isHealLine(entry) {
        return isFormationHealLine(entry) || isPlayerHealLine(entry);
    }

    function isRaidAbilityLine(entry) {
        return /\bmarked\s+[\d,.]+\s+damage\b/i.test(cleanText(entry));
    }

    function isTextModLine(row, hit) {
        const text = norm(cleanText(row));
        return !!text && (hit && hit.textMods || []).some(mod => mod.candidates.some(candidate => text.includes(candidate)));
    }

    function isMagicProcLine(row, hit) {
        return (hit && hit.magicProcs || []).some(proc => isMagicLineMatch(row, proc));
    }

    function shouldPromoteDetailRow(row, hit) {
        if (isArmyEventLine(row)) return showArmyEvents() && (!isFormationHealLine(row) || showHeals());
        return showHeals() && isPlayerHealLine(row)
            || showRaidAbilities() && isRaidAbilityLine(row)
            || showMagicProcs() && isMagicProcLine(row, hit)
            || showTextMods() && isTextModLine(row, hit);
    }

    function getHitRows(startEntry) {
        const rows = [];
        let entry = startEntry.nextElementSibling;
        while (entry && !isHitStartLine(entry)) {
            if (!entry.matches?.('.dotv-clp-panel') && !entry.classList.contains('dotv-clp-enhanced-shell')) rows.push(entry);
            entry = entry.nextElementSibling;
        }
        return rows;
    }

    function createToggle(title, onClick, expanded = false, kind = '') {
        const button = document.createElement('button');
        button.className = 'dotv-clp-toggle';
        button.type = 'button';
        button.title = title;
        button.textContent = expanded ? 'v' : '>';
        if (kind) button.dataset.dotvClpToggle = kind;
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            onClick(button);
        });
        return button;
    }

    function createPanel(breakdown) {
        const panel = document.createElement('div');
        panel.className = 'dotv-clp-panel';
        panel.hidden = true;
        panel.dataset.dotvClpPanel = '1';
        panel.dataset.dotvClpOpen = '0';

        if (breakdown.summary) {
            const summary = document.createElement('div');
            summary.className = 'dotv-clp-label';
            summary.textContent = breakdown.summary;
            panel.appendChild(summary);
        }

        const lines = document.createElement('div');
        lines.className = 'dotv-clp-lines';
        for (const row of breakdown.lines || []) {
            const label = document.createElement('span');
            label.className = 'dotv-clp-label';
            label.textContent = `${row.label}:`;
            const change = document.createElement('span');
            change.className = 'dotv-clp-value';
            change.textContent = !row.change && row.result ? `-> ${row.result}` : row.change;
            const result = document.createElement('span');
            result.className = 'dotv-clp-value';
            result.textContent = row.change && row.result ? `-> ${row.result}` : '';
            lines.append(label, change, result);
        }
        panel.appendChild(lines);

        for (const noteText of breakdown.notes || []) {
            const note = document.createElement('div');
            note.className = 'dotv-clp-note';
            note.textContent = noteText;
            panel.appendChild(note);
        }
        return panel;
    }

    function isElementNode(node) {
        return node && node.nodeType === 1;
    }

    function scrollLogToBottom(container) {
        if (!container) return;
        const scroll = () => {
            container.scrollTop = container.scrollHeight;
        };
        scroll();
        requestAnimationFrame(scroll);
        setTimeout(scroll, 40);
    }

    function captureRawRow(row) {
        if (!row || rawCapturedRows.has(row)) return;
        if (row.closest('.dotv-clp-enhanced-shell')) return;
        rawCapturedRows.add(row);
        const text = cleanText(row);
        if (text) rawLogEntries.push(text);
    }

    function baseLogRows(container) {
        if (!container) return [];
        return [...container.children]
            .filter(row => row.matches?.('div') && !row.classList.contains('dotv-clp-enhanced-shell'));
    }

    function captureRawLog(container) {
        if (!container) return;
        baseLogRows(container).forEach(captureRawRow);
    }

    function rawLogText() {
        document.querySelectorAll(LOG_CONTAINER_SELECTOR).forEach(captureRawLog);
        return rawLogEntries.join('\n');
    }

    function fallbackCopyText(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
        } finally {
            textarea.remove();
        }
    }

    function flashButton(button, text) {
        if (!button) return;
        const previous = button.textContent;
        button.textContent = text;
        setTimeout(() => {
            if (button.isConnected) button.textContent = previous;
        }, 900);
    }

    function copyRawLog(button) {
        const text = rawLogText();
        const copied = pageWindow.navigator && pageWindow.navigator.clipboard && pageWindow.navigator.clipboard.writeText
            ? pageWindow.navigator.clipboard.writeText(text)
            : Promise.resolve().then(() => fallbackCopyText(text));
        copied
            .then(() => flashButton(button, 'copied'))
            .catch(() => {
                fallbackCopyText(text);
                flashButton(button, 'copied');
            });
    }

    function createToolButton(text, title, onClick) {
        const button = document.createElement('button');
        button.className = 'dotv-clp-tool-button';
        button.type = 'button';
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            onClick(button);
        });
        return button;
    }

    function closeSettingsPanel() {
        if (settingsCloseHandler) {
            document.removeEventListener('mousedown', settingsCloseHandler, true);
            settingsCloseHandler = null;
        }
        if (settingsPanel) settingsPanel.remove();
        settingsPanel = null;
    }

    function toggleSettingsPanel(anchor) {
        if (settingsPanel) {
            closeSettingsPanel();
            return;
        }
        showSettingsPanel(anchor);
    }

    function addCheckboxSetting(parent, labelText, checked, onChange) {
        const row = document.createElement('div');
        row.className = 'dotv-clp-setting-row';
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        label.append(input, document.createTextNode(labelText));
        row.appendChild(label);
        parent.appendChild(row);
        return input;
    }

    function addNumberSetting(parent, labelText, value, onChange) {
        const row = document.createElement('div');
        row.className = 'dotv-clp-setting-row';
        const label = document.createElement('label');
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '3000';
        input.step = '1';
        input.value = String(value);
        input.addEventListener('change', () => onChange(input.value));
        row.append(label, input);
        parent.appendChild(row);
        return input;
    }

    function updateEnhancedVisibility() {
        const showEnhanced = enhancedLogVisible();
        document.querySelectorAll(LOG_CONTAINER_SELECTOR).forEach(container => {
            const shell = container.querySelector(':scope > .dotv-clp-enhanced-shell');
            if (shell) shell.hidden = !showEnhanced;
            container.classList.toggle('dotv-clp-enhanced-view', showEnhanced && !!shell);
        });
    }

    function showSettingsPanel(anchor) {
        closeSettingsPanel();
        const panel = document.createElement('div');
        panel.className = 'dotv-clp-settings';

        addCheckboxSetting(panel, 'Enhanced view', enhancedLogVisible(), checked => {
            setEnhancedLogVisible(checked);
            updateEnhancedVisibility();
        });
        addCheckboxSetting(panel, 'Compact attack details', compactEnabled(), checked => {
            setCompactEnabled(checked);
            document.querySelectorAll('.dotv-clp-raw-toggle').forEach(button => {
                setEnhancedDetailsOpen(button.closest('.dotv-clp-hit-card'), button, !checked);
            });
        });
        addCheckboxSetting(panel, 'Collapse damage breakdowns', damageCollapsed(), checked => {
            setDamageCollapsed(checked);
            document.querySelectorAll('[data-dotv-clp-section="damage"]').forEach(section => setEnhancedSectionOpen(section, !checked));
        });
        addCheckboxSetting(panel, 'Collapse army breakdowns', formationCollapsed(), checked => {
            setFormationCollapsed(checked);
            document.querySelectorAll('[data-dotv-clp-section="formation"]').forEach(section => setEnhancedSectionOpen(section, !checked));
        });
        addCheckboxSetting(panel, 'Always show army events', showArmyEvents(), checked => {
            setShowArmyEvents(checked);
            refreshEnhancedCards();
        });
        addCheckboxSetting(panel, 'Always show heals', showHeals(), checked => {
            setShowHeals(checked);
            refreshEnhancedCards();
        });
        addCheckboxSetting(panel, 'Always show raid abilities', showRaidAbilities(), checked => {
            setShowRaidAbilities(checked);
            refreshEnhancedCards();
        });
        addCheckboxSetting(panel, 'Always show magic procs', showMagicProcs(), checked => {
            setShowMagicProcs(checked);
            refreshEnhancedCards();
        });
        addCheckboxSetting(panel, 'Always show text procs', showTextMods(), checked => {
            setShowTextMods(checked);
            refreshEnhancedCards();
        });
        addCheckboxSetting(panel, 'Cap display hits', vanillaCapEnabled(), checked => {
            setVanillaCapEnabled(checked);
            document.querySelectorAll(LOG_CONTAINER_SELECTOR).forEach(capDisplayLog);
        });
        addNumberSetting(panel, 'Hits', vanillaCapRows(), value => {
            setVanillaCapRows(value);
            document.querySelectorAll(LOG_CONTAINER_SELECTOR).forEach(capDisplayLog);
        });

        document.body.appendChild(panel);
        const rect = anchor.getBoundingClientRect();
        const left = Math.max(6, Math.min(window.innerWidth - panel.offsetWidth - 6, rect.left));
        const top = Math.max(6, Math.min(window.innerHeight - panel.offsetHeight - 6, rect.bottom + 4));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        settingsPanel = panel;
        settingsCloseHandler = event => {
            if (panel.contains(event.target) || anchor.contains(event.target)) return;
            closeSettingsPanel();
        };
        setTimeout(() => document.addEventListener('mousedown', settingsCloseHandler, true), 0);
    }

    function createControlBar(className) {
        const controls = document.createElement('span');
        controls.className = className;
        const copy = createToolButton('Copy raw', 'Copy the untouched base battle log', copyRawLog);
        const settings = createToolButton('Settings', 'Combat Log Plus settings', toggleSettingsPanel);
        settings.classList.add('dotv-clp-gear-button');
        controls.append(copy, settings);
        return controls;
    }

    function ensureVanillaControls() {
        const controls = document.querySelector('.battlelog-controls');
        if (!controls || controls.querySelector('.dotv-clp-controls')) return;
        controls.appendChild(createControlBar('dotv-clp-controls'));
    }

    function ensureEnhancedLog(container) {
        ensureStyle();
        let shell = container.querySelector(':scope > .dotv-clp-enhanced-shell') || document.querySelector('.dotv-clp-enhanced-shell');
        if (!shell) {
            shell = document.createElement('div');
            shell.className = 'dotv-clp-enhanced-shell';
            const log = document.createElement('div');
            log.className = 'dotv-clp-enhanced-log';
            shell.append(log);
        }
        if (shell.parentElement !== container) {
            container.appendChild(shell);
        }
        updateEnhancedVisibility();
        return shell.querySelector('.dotv-clp-enhanced-log');
    }

    function ensureToolbar(container) {
        ensureStyle();
        ensureVanillaControls();
        if (container) {
            ensureEnhancedLog(container);
            stabilizeLogWidth(container);
        }
    }

    function stabilizeLogWidth(container) {
        if (!container) return;
        const shell = container.querySelector(':scope > .dotv-clp-enhanced-shell');
        const log = shell && shell.querySelector(':scope > .dotv-clp-enhanced-log');
        if (!shell || !log) return;
        const shellLeft = shell.getBoundingClientRect().left;
        let contentWidth = 0;
        shell.querySelectorAll('.dotv-clp-hit-card, .dotv-clp-panel, .dotv-clp-enhanced-row').forEach(node => {
            const nodeRect = node.getBoundingClientRect();
            if (nodeRect.width > 0) contentWidth = Math.max(contentWidth, nodeRect.right - shellLeft);
        });
        const scrollbarAndChrome = Math.max(20, container.offsetWidth - container.clientWidth + 6);
        const current = Math.ceil(Math.max(
            MIN_LOG_WIDTH,
            shell.scrollWidth || 0,
            log.scrollWidth || 0,
            contentWidth
        ) + scrollbarAndChrome);
        if (!current) return;
        container.dataset.dotvClpWidth = String(current);
        container.style.setProperty('--dotv-clp-log-width', `${current}px`);
    }

    function capVanillaLog(container) {
        captureRawLog(container);
        const maxHits = vanillaCapRows();
        const rows = baseLogRows(container);
        const starts = [];
        rows.forEach((row, index) => {
            if (isHitStartLine(row)) starts.push(index);
        });
        if (starts.length <= maxHits) return;
        const cutoff = starts[starts.length - maxHits];
        rows.slice(0, cutoff).forEach(row => row.remove());
    }

    function removeEnhancedCard(card) {
        if (card) card.remove();
    }

    function capEnhancedLog(container) {
        const log = container && container.querySelector(':scope > .dotv-clp-enhanced-shell > .dotv-clp-enhanced-log');
        if (!log) return;
        const maxHits = vanillaCapRows();
        const cards = [...log.children].filter(card => card.classList.contains('dotv-clp-hit-card'));
        const overflow = cards.length - maxHits;
        if (overflow <= 0) return;
        cards.slice(0, overflow).forEach(removeEnhancedCard);
    }

    function capDisplayLog(container) {
        if (!container) return;
        stabilizeLogWidth(container);
        if (!vanillaCapEnabled()) return;
        capVanillaLog(container);
        capEnhancedLog(container);
    }

    function refitEnhancedLogFor(node) {
        const container = node && node.closest && node.closest(LOG_CONTAINER_SELECTOR);
        if (!container) return;
        capDisplayLog(container);
        requestAnimationFrame(() => capDisplayLog(container));
    }

    function isMagicLineMatch(row, proc) {
        if (row.dataset.dotvClpMagic) return false;
        if (row.textContent.includes(`(${proc.percentText}%)`)) return false;
        const text = normalizedText(row);
        const name = String(proc.name || '').replace(/['\u2019]/g, '').toLowerCase();
        if (proc.type === 'playerDamageReduction') {
            return text.includes(name) && (text.includes('reduced the damage you took') || text.includes('damage mitigated'));
        }
        return text.includes(name) && text.includes(proc.amountText.replace(/,/g, '').toLowerCase().replace(/['\u2019]/g, ''))
            || text.includes(name) && text.includes(proc.amountText) && text.includes('damage');
    }

    function appendPercent(row, proc) {
        const span = document.createElement('span');
        span.className = 'dotv-clp-percent';
        span.textContent = ` (${proc.percentText}%)`;
        row.appendChild(span);
        row.dataset.dotvClpMagic = '1';
    }

    function annotateMagic(rows, hit) {
        const matched = new Set();
        for (const proc of hit.magicProcs || []) {
            const row = rows.find(entry => !matched.has(entry) && isMagicLineMatch(entry, proc));
            if (!row) continue;
            matched.add(row);
            appendPercent(row, proc);
        }
    }

    function setEnhancedDetailsOpen(scope, button, open) {
        if (!scope) return;
        const details = scope.classList && scope.classList.contains('dotv-clp-hit-card')
            ? [...scope.querySelectorAll(':scope > .dotv-clp-enhanced-details')]
            : [scope];
        details.forEach(row => {
            row.hidden = !open;
        });
        if (button) button.textContent = open ? 'v' : '>';
        refitEnhancedLogFor(scope);
    }

    function setEnhancedSectionOpen(section, open) {
        if (!section) return;
        const panel = section.querySelector(':scope > .dotv-clp-panel');
        const toggle = section.querySelector(':scope > .dotv-clp-enhanced-row > .dotv-clp-toggle');
        if (!panel) return;
        panel.hidden = !open;
        panel.dataset.dotvClpOpen = open ? '1' : '0';
        if (toggle) toggle.textContent = open ? 'v' : '>';
        refitEnhancedLogFor(section);
    }

    function createEnhancedTextRow(text, className = '') {
        const row = document.createElement('div');
        row.className = `dotv-clp-enhanced-row${className ? ` ${className}` : ''}`;
        const action = document.createElement('span');
        action.style.color = 'orange';
        action.textContent = text;
        row.appendChild(action);
        return row;
    }

    function isHardRaidOrange(color) {
        const value = String(color || '').toLowerCase().replace(/\s+/g, '');
        return value === 'orange' || value === 'rgb(255,165,0)';
    }

    function retintHardRaidName(row) {
        if (!row || !/\bstrikes you for [\d,]+ damage\b/.test(cleanText(row))) return;
        const contributor = row.querySelector(':scope > span');
        if (!contributor || !isHardRaidOrange(contributor.style && contributor.style.color)) return;
        contributor.style.color = '#ff7a1a';
    }

    function createEnhancedLogRow(source, className = '') {
        if (!source || !source.cloneNode) return createEnhancedTextRow(String(source || ''), className);
        const row = document.createElement('div');
        row.className = `dotv-clp-enhanced-row${className ? ` ${className}` : ''}`;
        source.childNodes.forEach(child => row.appendChild(child.cloneNode(true)));
        if (!row.childNodes.length) return createEnhancedTextRow(cleanText(source), className);
        retintHardRaidName(row);
        return row;
    }

    function createEnhancedSection(rowSource, breakdown, title, sectionKind, collapsed) {
        const section = document.createElement('div');
        section.dataset.dotvClpSection = sectionKind;
        const row = createEnhancedLogRow(rowSource, 'dotv-clp-section-row');
        section.appendChild(row);
        if (!breakdown) return section;

        const panel = createPanel(breakdown);
        const open = !collapsed;
        panel.hidden = !open;
        panel.dataset.dotvClpOpen = open ? '1' : '0';
        row.prepend(createToggle(title, () => setEnhancedSectionOpen(section, panel.hidden), open, 'enhanced-panel'));
        section.appendChild(panel);
        return section;
    }

    function appendSyntheticEvadesToCard(card, hit) {
        for (const evade of hit.syntheticEvades || []) {
            for (let i = 0; i < evade.count; i++) {
                card.appendChild(createEnhancedTextRow(`You nimbly evaded ${evade.abilityName}!`, 'dotv-clp-synthetic-evade'));
            }
        }
    }

    function enhancedDetailsOpen(card) {
        const toggle = card && card.querySelector(':scope > .dotv-clp-main-row > .dotv-clp-raw-toggle');
        if (!toggle) return !compactEnabled();
        return toggle.textContent === 'v';
    }

    function cloneLogRow(row) {
        const clone = row.cloneNode(true);
        clone.removeAttribute('data-dotv-clp-hit');
        return clone;
    }

    function buildEnhancedCard(hit, start, rows, rawDetailsOpen = !compactEnabled()) {
        const damageRow = rows.find(row => isDamageTakenLine(row, hit.damageBreakdown));
        const evadeRow = rows.find(isEvasionLine);
        const damageStart = damageRow || evadeRow;
        const showArmy = showArmyEvents();
        const troopRow = showArmy ? rows.find(isTroopLossLine) : null;
        const commanderRow = showArmy ? rows.find(isCommanderInjuryLine) : null;
        const troopHealRow = showArmy && showHeals() ? rows.find(isTroopHealLine) : null;
        const commanderHealRow = showArmy && showHeals() ? rows.find(isCommanderHealLine) : null;
        const customRows = [];
        const rawDetailRows = [];

        const card = document.createElement('div');
        card.className = 'dotv-clp-hit-card';
        card.dataset.dotvClpHitCard = hit.id;

        const header = createEnhancedLogRow(start, 'dotv-clp-main-row');
        card.appendChild(header);
        customRows.push(header);

        for (const row of rows) {
            if (row === damageStart) {
                const section = createEnhancedSection(
                    damageStart,
                    hit.damageBreakdown,
                    'Show damage taken breakdown',
                    'damage',
                    damageCollapsed()
                );
                card.appendChild(section);
                customRows.push(section.querySelector('.dotv-clp-enhanced-row'));
                appendSyntheticEvadesToCard(card, hit);
                continue;
            }

            if (row === troopRow) {
                const section = createEnhancedSection(
                    troopRow,
                    hit.troopBreakdown,
                    'Show troop loss breakdown',
                    'formation',
                    formationCollapsed()
                );
                card.appendChild(section);
                customRows.push(section.querySelector('.dotv-clp-enhanced-row'));
                continue;
            }

            if (row === commanderRow) {
                const section = createEnhancedSection(
                    commanderRow,
                    hit.commanderBreakdown,
                    'Show commander injury breakdown',
                    'formation',
                    formationCollapsed()
                );
                card.appendChild(section);
                customRows.push(section.querySelector('.dotv-clp-enhanced-row'));
                continue;
            }

            if (row === troopHealRow) {
                const section = createEnhancedSection(
                    troopHealRow,
                    hit.troopHealBreakdown,
                    'Show troop healing breakdown',
                    'formation',
                    formationCollapsed()
                );
                card.appendChild(section);
                customRows.push(section.querySelector('.dotv-clp-enhanced-row'));
                continue;
            }

            if (row === commanderHealRow) {
                const section = createEnhancedSection(
                    commanderHealRow,
                    hit.commanderHealBreakdown,
                    'Show commander healing breakdown',
                    'formation',
                    formationCollapsed()
                );
                card.appendChild(section);
                customRows.push(section.querySelector('.dotv-clp-enhanced-row'));
                continue;
            }

            const promoted = shouldPromoteDetailRow(row, hit);
            const copy = createEnhancedLogRow(row, promoted ? 'dotv-clp-visible-detail' : 'dotv-clp-enhanced-details');
            if (!promoted) {
                copy.hidden = !rawDetailsOpen;
                rawDetailRows.push(copy);
            }
            card.appendChild(copy);
            customRows.push(copy);
        }

        if (!damageStart) {
            appendSyntheticEvadesToCard(card, hit);
        }

        if (rawDetailRows.length) {
            const toggle = createToggle('Show raw hit details', button => {
                setEnhancedDetailsOpen(card, button, rawDetailRows.some(row => row.hidden));
            }, rawDetailsOpen, 'raw');
            toggle.classList.add('dotv-clp-raw-toggle');
            header.prepend(toggle);
        }

        annotateMagic(customRows.filter(Boolean), hit);
        return card;
    }

    function refreshEnhancedCards() {
        document.querySelectorAll('.dotv-clp-hit-card').forEach(card => {
            const data = enhancedCardData.get(card);
            if (!data) return;
            const replacement = buildEnhancedCard(data.hit, data.start, data.rows, enhancedDetailsOpen(card));
            enhancedCardData.set(replacement, data);
            card.replaceWith(replacement);
        });
        document.querySelectorAll(LOG_CONTAINER_SELECTOR).forEach(capDisplayLog);
    }

    function isLogStable(container) {
        const lastMutation = lastLogMutationAt.get(container) || 0;
        return Date.now() - lastMutation >= LOG_STABLE_MS;
    }

    function renderEnhancedHit(container, hit, start, rows) {
        if (renderedEnhancedHits.has(hit.id)) return true;
        const log = ensureEnhancedLog(container);
        if (!log) return false;

        const sourceStart = cloneLogRow(start);
        const sourceRows = rows.map(cloneLogRow);
        const card = buildEnhancedCard(hit, sourceStart, sourceRows);
        enhancedCardData.set(card, { hit, start: sourceStart, rows: sourceRows });
        log.appendChild(card);
        stabilizeLogWidth(container);
        renderedEnhancedHits.add(hit.id);
        start.dataset.dotvClpHit = hit.id;
        rows.forEach(row => {
            if (!row.dataset.dotvClpHit) row.dataset.dotvClpHit = hit.id;
        });
        scrollLogToBottom(container);
        capDisplayLog(container);
        return true;
    }

    function applyHit(container, hit) {
        if (!isLogStable(container)) return false;
        const topRows = baseLogRows(container).slice(-RECENT_LOG_ROW_SCAN);
        const start = topRows.find(row => row.dataset.dotvClpHit === hit.id)
            || topRows.find(row => isHitStartLine(row, hit) && !row.dataset.dotvClpHit);
        if (!start) return false;

        ensureToolbar(container);
        const rows = getHitRows(start);
        captureRawRow(start);
        rows.forEach(captureRawRow);
        return renderEnhancedHit(container, hit, start, rows);
    }

    function applyPending() {
        const containers = document.querySelectorAll('.battle-log-container');
        const now = Date.now();

        ensureToolbar();
        for (let i = 0; i < pendingHits.length; i++) {
            const hit = pendingHits[i];
            const matched = [...containers].some(container => applyHit(container, hit));
            if (matched && !hit.appliedAt) hit.appliedAt = now;
            if (now - hit.createdAt > PENDING_TTL_MS || hit.appliedAt && now - hit.appliedAt > APPLIED_REFRESH_MS) {
                pendingHits.splice(i, 1);
                i--;
            }
        }
        if (pendingHits.some(hit => !hit.appliedAt) && !applyTimer) scheduleApply(LOG_STABLE_MS);
    }

    function applyPendingSafely() {
        if (applyingLogUpdates) return;
        applyingLogUpdates = true;
        try {
            applyPending();
        } catch (error) {
            console.warn(`[${SCRIPT}] failed to update battle log`, error);
        } finally {
            applyingLogUpdates = false;
        }
    }

    function scheduleApply(delay = 8) {
        if (applyTimer) return;
        applyTimer = setTimeout(() => {
            applyTimer = 0;
            applyPendingSafely();
        }, delay);
    }

    function directLogRowsFrom(node, container) {
        if (!isElementNode(node)) return [];
        const rows = [];
        if (node.parentElement === container && node.matches('div') && !node.classList.contains('dotv-clp-enhanced-shell')) rows.push(node);
        node.querySelectorAll?.('div').forEach(child => {
            if (child.parentElement === container && !child.classList.contains('dotv-clp-enhanced-shell')) rows.push(child);
        });
        return rows;
    }

    function observeLogContainer(container) {
        if (!container || observedLogContainers.has(container)) return false;
        ensureStyle();
        ensureToolbar(container);
        captureRawLog(container);
        lastLogMutationAt.set(container, 0);
        observedLogContainers.add(container);

        new MutationObserver(mutations => {
            let sawRows = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    const rows = directLogRowsFrom(node, container);
                    for (const row of rows) {
                        sawRows = true;
                        captureRawRow(row);
                    }
                }
            }
            if (sawRows) {
                lastLogMutationAt.set(container, Date.now());
                if (pendingHits.length) scheduleApply(LOG_STABLE_MS);
                setTimeout(() => capDisplayLog(container), LOG_STABLE_MS + 20);
            }
        }).observe(container, { childList: true });
        return true;
    }

    function observeKnownLogs() {
        let added = false;
        document.querySelectorAll(LOG_CONTAINER_SELECTOR).forEach(container => {
            added = observeLogContainer(container) || added;
        });
        return added;
    }

    function mutationAddedTarget(mutations, selector) {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!isElementNode(node)) continue;
                if (node.matches(selector) || node.querySelector?.(selector)) return true;
            }
        }
        return false;
    }

    function scheduleKnownLogCheck() {
        if (bodyObserveTimer) return;
        bodyObserveTimer = setTimeout(() => {
            bodyObserveTimer = 0;
            const addedLog = observeKnownLogs();
            const needsToolbar = document.querySelector('.battlelog-controls') && !document.querySelector('.dotv-clp-controls');
            if (addedLog && pendingHits.length) {
                applyPendingSafely();
            } else if (needsToolbar) {
                scheduleApply();
            }
        }, BODY_OBSERVER_THROTTLE_MS);
    }

    function observeBattleLog() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', observeBattleLog, { once: true });
            return;
        }
        observeKnownLogs();
        new MutationObserver(mutations => {
            if (mutationAddedTarget(mutations, LOG_CONTAINER_SELECTOR) || mutationAddedTarget(mutations, '.battlelog-controls')) {
                scheduleKnownLogCheck();
            }
        }).observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function patchXHR() {
        const NativeXHR = pageWindow.XMLHttpRequest || XMLHttpRequest;
        if (!NativeXHR || NativeXHR.__dotvClpPatched) return;

        function CombatLogPlusXMLHttpRequest() {
            const xhr = new NativeXHR();

            xhr.addEventListener('load', function () {
                try {
                    const url = this.responseURL || '';
                    if (!shouldInspectUrl(url)) return;

                    const data = JSON.parse(this.responseText);
                    handleResponse(url, data, null);
                } catch { }
            });

            return xhr;
        }

        CombatLogPlusXMLHttpRequest.prototype = NativeXHR.prototype;
        Object.setPrototypeOf(CombatLogPlusXMLHttpRequest, NativeXHR);
        CombatLogPlusXMLHttpRequest.__dotvClpPatched = true;
        pageWindow.XMLHttpRequest = CombatLogPlusXMLHttpRequest;
    }

    restoreStats();
    restoreFormationState();
    patchXHR();
    observeBattleLog();
})();
