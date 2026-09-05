// ==UserScript==
// @name         DOTV Guild Activity Monitor
// @namespace    dotv.local
// @author       infinity
// @version      2026.09.05
// @description  Independent guild dashboard with full donation history, Monday-UTC totals, member activity and local exports.
// @match        https://play.dragonsofthevoid.com/*
// @grant        none
// @run-at       document-start
// @noframes
// @supportURL   https://github.com/MattiasKDev/dotv-public#support
// @updateURL    https://raw.githubusercontent.com/MattiasKDev/dotv-public/main/userscripts/dotv-guild-activity-monitor.user.js
// @downloadURL  https://raw.githubusercontent.com/MattiasKDev/dotv-public/main/userscripts/dotv-guild-activity-monitor.user.js
// ==/UserScript==

(function (factory) {
    'use strict';
    const ledger = factory();
    if (typeof module === 'object' && module.exports) module.exports = ledger;
    else ledger.install();
})(function () {
    'use strict';

    const VERSION = '2026.09.05.10';
    // The ONLY game API endpoint. StatVault's separate public read-only summary
    // is opt-in by opening Activity, and never receives the game's auth token.
    const API = 'https://api.dragonsofthevoid.com/api/guilds/transactions';
    const ACTIVITY_API = 'https://statvault-sync.mattias-cb7.workers.dev/v1/guild-activity/summary';
    let activityRetryAt = 0;
    const DAY = 86400000;
    const WEEK = 7 * DAY;
    const SETTINGS_KEY = 'dotv.donationLedger.preferences.v1';
    const GUILD_SETTINGS_PREFIX = 'dotv.guildActivity.settings.v1:';
    const STATS_KEY = 'dotv.guildActivity.statvault.v1';
    const SNAPSHOT_PREFIX = 'dotv.guildActivity.observations.v1:';
    const fmt = value => Number(value).toLocaleString('en-US');
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    function parseUtc(value) {
        if (typeof value !== 'string') throw new Error('Invalid UTC timestamp.');
        const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z?$/.exec(value);
        if (!match) throw new Error('Invalid UTC timestamp.');
        const [, year, month, day, hour, minute, second, fraction = ''] = match;
        const ms = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, +(fraction.padEnd(3, '0')));
        const date = new Date(ms);
        if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day || date.getUTCHours() !== +hour || date.getUTCMinutes() !== +minute || date.getUTCSeconds() !== +second) throw new Error('Invalid UTC timestamp.');
        return ms;
    }

    function weekStartUtc(timestamp) {
        const date = new Date(parseUtc(timestamp));
        const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
        return new Date(midnight - ((date.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
    }

    function validateRow(row) {
        if (!row || !Number.isSafeInteger(row.transactionId) || row.transactionId < 1 || row.txnTypeId !== 1 || !Number.isSafeInteger(row.donatedTokenQty) || row.donatedTokenQty < 0 || typeof row.characterName !== 'string' || !row.characterName.trim()) throw new Error('Invalid donation record in API response.');
        parseUtc(row.timestamp);
        return row;
    }

    function joinDateMs(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Enter a valid join date (YYYY-MM-DD).');
        return parseUtc(value + 'T00:00:00Z');
    }

    function membershipGoalForWeek(week, joinDate, weeklyGoal, joinWeekPolicy = 'full') {
        if (!Number.isSafeInteger(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 1000000) throw new Error('Weekly goal must be a whole number from 1 to 1,000,000.');
        if (!['prorated', 'full', 'next'].includes(joinWeekPolicy)) throw new Error('Invalid joining-week policy.');
        const start = joinDateMs(week);
        if (weekStartUtc(week + 'T00:00:00Z') !== week) throw new Error('Week must begin on Monday.');
        if (!joinDate) return null;
        const joined = joinDateMs(joinDate);
        if (joined >= start + WEEK) return 0;
        // Legacy policy arguments remain readable, but every started membership
        // week now requires the full target, including the joining week.
        return weeklyGoal;
    }

    function buildPeriods({ unit = 'week', count = 4, now = Date.now() } = {}) {
        if (unit !== 'week') throw new Error('Period must be week.');
        if (!Number.isInteger(count) || count < 1 || count > 5201) throw new Error('Choose 1 to 5201 weeks.');
        if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new Error('Invalid current time.');
        const currentStart = joinDateMs(weekStartUtc(new Date(now).toISOString()));
        return Array.from({ length: count }, (_, index) => {
            const startMs = currentStart - index * WEEK;
            const endMs = startMs + WEEK;
            const start = new Date(startMs).toISOString().slice(0, 10);
            return { unit, start, endExclusive: new Date(endMs).toISOString().slice(0, 10), label: start, isCurrent: now >= startMs && now < endMs };
        });
    }

    function readableDateRange(start, endExclusive) {
        const firstMs = joinDateMs(start);
        const endMs = joinDateMs(endExclusive);
        if (endMs <= firstMs) throw new Error('Date range must end after it starts.');
        const first = new Date(firstMs);
        const last = new Date(endMs - DAY);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dayLabel = date => `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
        const firstYear = first.getUTCFullYear();
        const lastYear = last.getUTCFullYear();
        if (firstMs === endMs - DAY) return `${dayLabel(first)}, ${firstYear}`;
        if (firstYear !== lastYear) return `${dayLabel(first)}, ${firstYear}–${dayLabel(last)}, ${lastYear}`;
        if (first.getUTCMonth() === last.getUTCMonth()) return `${dayLabel(first)}–${last.getUTCDate()}, ${firstYear}`;
        return `${dayLabel(first)}–${dayLabel(last)}, ${firstYear}`;
    }

    function readablePeriod(period) {
        if (period?.unit !== 'week') throw new Error('Period must be week.');
        periodBounds(period);
        return readableDateRange(period.start, period.endExclusive);
    }

    function focusedPeriod({ unit = 'week', start = '', now = Date.now() } = {}) {
        const current = buildPeriods({ unit, count: 1, now })[0];
        if (start === '') return current;
        joinDateMs(start);
        const currentStart = joinDateMs(current.start);
        const selectedStart = joinDateMs(weekStartUtc(start + 'T00:00:00Z'));
        // Keep old history drilldowns valid without allocating a week catalog.
        const startMs = Math.max(currentStart - 5200 * WEEK, Math.min(currentStart, selectedStart));
        const alignedStart = new Date(startMs).toISOString().slice(0, 10);
        return { unit, start: alignedStart, endExclusive: new Date(startMs + WEEK).toISOString().slice(0, 10), label: alignedStart, isCurrent: startMs === currentStart };
    }

    function moveFocusedPeriod({ unit = 'week', start = '', direction, now = Date.now() } = {}) {
        if (!['previous', 'next'].includes(direction)) throw new Error('Direction must be previous or next.');
        const current = focusedPeriod({ unit, start, now });
        const movedStart = joinDateMs(current.start) + (direction === 'previous' ? -WEEK : WEEK);
        return focusedPeriod({ unit, start: new Date(movedStart).toISOString().slice(0, 10), now });
    }

    function periodBounds(period) {
        const start = joinDateMs(period?.start);
        const end = joinDateMs(period?.endExclusive);
        if (end <= start || end - start > 732 * DAY) throw new Error('Invalid period boundaries.');
        return { start, end };
    }

    function membershipGoalForPeriod(period, joinDate, weeklyGoal, joinWeekPolicy = 'full') {
        if (period?.unit !== 'week') throw new Error('Period must be week.');
        const { start, end } = periodBounds(period);
        if (end - start !== WEEK) throw new Error('Weekly period must span exactly seven days.');
        return membershipGoalForWeek(period.start, joinDate, weeklyGoal, joinWeekPolicy);
    }

    function summarizeDonationPeriod(rows, period, { memberName, joinDate, now = Date.now() } = {}) {
        const { start, end } = periodBounds(period);
        if (!Number.isFinite(now)) throw new Error('Invalid current time.');
        const joined = joinDate ? joinDateMs(joinDate) : -Infinity;
        const result = { recordedTokens: 0, creditedTokens: 0, transactionCount: 0 };
        for (const row of rows) {
            if (row?.txnTypeId !== 1 || (memberName != null && row.characterName !== memberName)) continue;
            validateRow(row);
            const at = parseUtc(row.timestamp);
            if (at < start || at >= end || at > now) continue;
            result.recordedTokens += row.donatedTokenQty;
            if (at >= joined) result.creditedTokens += row.donatedTokenQty;
            result.transactionCount++;
            if (!Number.isSafeInteger(result.recordedTokens) || !Number.isSafeInteger(result.creditedTokens)) throw new Error('Donation total exceeds safe integer range.');
        }
        return result;
    }

    function buildDonationMatrix(rows, { periods = buildPeriods(), members, joinDates = {}, now = Date.now() } = {}) {
        const names = members ? [...new Set(members)] : [...new Set(rows.filter(r => r?.txnTypeId === 1).map(r => r.characterName))].sort((a, b) => a.localeCompare(b));
        const periodEnds = periods.map(period => periodBounds(period).end);
        const sums = periods.map(() => 0);
        const body = names.map(name => {
            const joinDate = Object.hasOwn(joinDates, name) ? joinDates[name] : undefined;
            const joined = joinDate != null && joinDate !== '' ? joinDateMs(joinDate) : null;
            const values = periods.map((period, index) => {
                // Before joining, a member owes nothing and their older donations
                // do not belong to this membership's totals or the guild footer.
                if (joined != null && joined >= periodEnds[index]) return 'N/A';
                const qty = summarizeDonationPeriod(rows, period, { memberName: name, joinDate, now }).creditedTokens;
                sums[index] += qty;
                if (!Number.isSafeInteger(sums[index])) throw new Error('Donation total exceeds safe integer range.');
                return qty;
            });
            const total = values.reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
            if (!Number.isSafeInteger(total)) throw new Error('Donation total exceeds safe integer range.');
            return [name, ...values, total];
        });
        const total = sums.reduce((sum, value) => sum + value, 0);
        if (!Number.isSafeInteger(total)) throw new Error('Donation total exceeds safe integer range.');
        return [['Member', ...periods.map(p => p.label + (p.isCurrent ? ' (so far)' : '')), 'Total'], ...body, ['Guild total', ...sums, total]];
    }

    function summarizeMemberGoals(rows, { memberName, joinDate, weeklyGoal = 500, joinWeekPolicy = 'full', now = Date.now() } = {}) {
        if (!Number.isFinite(now)) throw new Error('Invalid current time.');
        const currentWeek = weekStartUtc(new Date(now).toISOString());
        membershipGoalForWeek(currentWeek, joinDate, weeklyGoal, joinWeekPolicy);
        const result = { joinDate: joinDate || null, eligibleTokens: null, totalGoal: null, completedGoal: null, currentGoal: null, remaining: null, completedShortfall: null, eligibleWeeks: 0, completedWeeks: 0, weeksMet: 0, zeroWeeks: 0 };
        if (!joinDate) return result;
        Object.assign(result, { eligibleTokens: 0, totalGoal: 0, completedGoal: 0, currentGoal: 0, remaining: 0, completedShortfall: 0 });
        const joined = joinDateMs(joinDate);
        if (joined > now) return result;
        const firstWeek = weekStartUtc(joinDate + 'T00:00:00Z');
        const start = Date.parse(firstWeek + 'T00:00:00Z');
        const end = Date.parse(currentWeek + 'T00:00:00Z');
        if ((end - start) / WEEK > 5200) throw new Error('Join date spans an unsupported date range.');
        const totals = new Map();
        let completedTokens = 0;
        for (const row of rows) {
            if (row.characterName !== memberName || row.txnTypeId !== 1) continue;
            validateRow(row);
            const at = parseUtc(row.timestamp);
            if (at < joined || at > now) continue;
            const week = weekStartUtc(row.timestamp);
            result.eligibleTokens += row.donatedTokenQty;
            if (!Number.isSafeInteger(result.eligibleTokens)) throw new Error('Donation total exceeds safe integer range.');
            totals.set(week, (totals.get(week) || 0) + row.donatedTokenQty);
            if (week < currentWeek) completedTokens += row.donatedTokenQty;
        }
        for (let ms = start; ms <= end; ms += WEEK) {
            const week = new Date(ms).toISOString().slice(0, 10);
            const goal = membershipGoalForWeek(week, joinDate, weeklyGoal, joinWeekPolicy);
            result.totalGoal += goal;
            if (goal > 0) result.eligibleWeeks++;
            if (week === currentWeek) result.currentGoal = goal;
            else {
                result.completedGoal += goal;
                if (goal > 0) {
                    result.completedWeeks++;
                    if ((totals.get(week) || 0) >= goal) result.weeksMet++;
                    if (!(totals.get(week) || 0)) result.zeroWeeks++;
                }
            }
        }
        result.remaining = Math.max(0, result.totalGoal - result.eligibleTokens);
        result.completedShortfall = Math.max(0, result.completedGoal - completedTokens);
        return result;
    }

    function normalizeGuildSettings(value, fallbackGoal = 500) {
        const goal = Number(value?.goal ?? fallbackGoal);
        const joinDates = Object.create(null);
        for (const [name, date] of Object.entries(value?.joinDates || {})) {
            if (!name.trim() || name.length > 150) continue;
            try { joinDateMs(date); joinDates[name] = date; } catch { }
        }
        // Upgrade saved proration/waiver settings without losing dates or target.
        return { goal: Number.isSafeInteger(goal) && goal >= 1 && goal <= 1000000 ? goal : 500, joinDates, joinWeekPolicy: 'full' };
    }

    function aggregateDonations(rows, { now = Date.now(), memberNames = [] } = {}) {
        const currentWeek = weekStartUtc(new Date(now).toISOString());
        const members = new Set(memberNames);
        const cells = new Map();
        const guildTotals = new Map();
        const firstSeen = new Map();
        let totalTokens = 0;
        let first = currentWeek;
        let last = currentWeek;
        for (const row of rows) {
            validateRow(row);
            const week = weekStartUtc(row.timestamp);
            first = week < first ? week : first;
            last = week > last ? week : last;
            members.add(row.characterName);
            if (!firstSeen.has(row.characterName) || week < firstSeen.get(row.characterName)) firstSeen.set(row.characterName, week);
            if (!cells.has(week)) cells.set(week, new Map());
            cells.get(week).set(row.characterName, (cells.get(week).get(row.characterName) || 0) + row.donatedTokenQty);
            guildTotals.set(week, (guildTotals.get(week) || 0) + row.donatedTokenQty);
            totalTokens += row.donatedTokenQty;
            if (!Number.isSafeInteger(totalTokens)) throw new Error('Donation total exceeds safe integer range.');
        }
        const weeks = [];
        for (let ms = Date.parse(last + 'T00:00:00Z'), min = Date.parse(first + 'T00:00:00Z'); ms >= min; ms -= WEEK) {
            if (weeks.length > 5200) throw new Error('Donation history spans an unsupported date range.');
            const key = new Date(ms).toISOString().slice(0, 10);
            weeks.push(key);
            if (!cells.has(key)) cells.set(key, new Map());
            if (!guildTotals.has(key)) guildTotals.set(key, 0);
        }
        return { members: [...members].sort((a, b) => a.localeCompare(b)), weeks, cells, guildTotals, firstSeen, totalTokens, transactionCount: rows.length, currentWeek };
    }

    function abortCheck(signal) {
        if (signal?.aborted) throw new DOMException('Loading cancelled.', 'AbortError');
    }

    function delay(ms, signal) {
        abortCheck(signal);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
            function abort() { clearTimeout(timer); reject(new DOMException('Loading cancelled.', 'AbortError')); }
            signal?.addEventListener('abort', abort, { once: true });
        });
    }

    function validatePage(payload, page) {
        if (!payload || !Array.isArray(payload.data) || payload.page !== page || !Number.isSafeInteger(payload.pageSize) || payload.pageSize < 1 || !Number.isSafeInteger(payload.totalElements) || payload.totalElements < 0 || !Number.isSafeInteger(payload.totalPages) || payload.totalPages < 0 || payload.totalPages > 10000) throw new Error('Invalid pagination metadata from donation API.');
        const expected = Math.ceil(payload.totalElements / payload.pageSize);
        if (payload.totalPages !== expected && !(expected === 0 && payload.totalPages === 1)) throw new Error('Invalid page count from donation API.');
        payload.data.forEach(validateRow);
        return payload;
    }

    function rowSignature(row) {
        return JSON.stringify([row.transactionId, row.txnTypeId, row.guildBuildingIdFk, row.donatedTokenQty, row.timestamp, row.characterName, row.buildingName]);
    }

    async function fetchAllDonations({ requestPage, signal, onProgress = () => { }, maxPasses = 3, pageSize = 100 }) {
        if (typeof requestPage !== 'function') throw new Error('A donation page reader is required.');
        for (let pass = 1; pass <= maxPasses; pass++) {
            abortCheck(signal);
            const controller = new AbortController();
            const cancel = () => controller.abort();
            signal?.addEventListener('abort', cancel, { once: true });
            let workers = [];
            try {
                const read = async (page, size) => {
                    abortCheck(controller.signal);
                    const payload = await requestPage({ page, pageSize: size, signal: controller.signal });
                    abortCheck(controller.signal);
                    return validatePage(payload, page);
                };
                const first = await read(1, pageSize);
                const pages = new Array(Math.max(first.totalPages, 1));
                pages[0] = first;
                let next = 2;
                let complete = 1;
                onProgress({ pass, page: 1, completed: complete, totalPages: pages.length, totalElements: first.totalElements, phase: 'loading' });
                workers = Array.from({ length: Math.min(3, pages.length - 1) }, async () => {
                    while (next <= pages.length) {
                        const page = next++;
                        pages[page - 1] = await read(page, first.pageSize);
                        onProgress({ pass, page, completed: ++complete, totalPages: pages.length, totalElements: first.totalElements, phase: 'loading' });
                    }
                });
                await Promise.all(workers);
                const latest = await read(1, first.pageSize);
                const stable = latest.totalElements === first.totalElements && latest.pageSize === first.pageSize && latest.data.map(rowSignature).join('|') === first.data.map(rowSignature).join('|') && pages.every(p => p.totalElements === first.totalElements && p.pageSize === first.pageSize && p.totalPages === first.totalPages);
                const unique = new Map();
                let count = 0;
                let conflict = false;
                for (const p of pages) for (const row of p.data) {
                    count++;
                    const old = unique.get(row.transactionId);
                    if (old && rowSignature(old) !== rowSignature(row)) conflict = true;
                    unique.set(row.transactionId, row);
                }
                if (stable && !conflict && unique.size === first.totalElements) {
                    onProgress({ pass, completed: pages.length, totalPages: pages.length, totalElements: first.totalElements, phase: 'complete' });
                    return { transactions: [...unique.values()].sort((a, b) => b.transactionId - a.transactionId), reportedTotal: first.totalElements, duplicateRowsRemoved: count - unique.size, fetchedAt: new Date().toISOString() };
                }
                if (pass === maxPasses) throw new Error(`Could not reconcile the full log (${unique.size} unique / ${first.totalElements} reported). History changed or a page is incomplete. Please refresh.`);
                onProgress({ pass: pass + 1, completed: 0, totalPages: pages.length, phase: 'restarting', totalElements: first.totalElements });
            } catch (error) {
                controller.abort();
                await Promise.allSettled(workers);
                throw error;
            } finally {
                signal?.removeEventListener('abort', cancel);
            }
        }
        throw new Error('No complete donation snapshot was loaded.');
    }

    function csvEncode(matrix) {
        return matrix.map(row => row.map(value => {
            let text = String(value ?? '');
            if (typeof value === 'string' && /^\s*[=+@-]/.test(text)) text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
        }).join(',')).join('\r\n');
    }

    function normalizeStatImport(value) {
        const characterName = String(value?.user?.characterName ?? value?.characterName ?? '').trim();
        const userId = String(value?.user?.id ?? value?.userId ?? '').trim();
        if (!characterName || characterName.length > 150 || !userId || userId.length > 150) throw new Error('StatVault history needs user.id and user.characterName.');
        let rows = value.dailyStats;
        if (!rows && value.statStore && typeof value.statStore === 'object') rows = Object.entries(value.statStore).map(([date, row]) => ({ ...row, date }));
        if (!Array.isArray(rows) || rows.length > 10000) throw new Error('Invalid StatVault daily history.');
        const byDate = new Map();
        for (const row of rows) {
            if (row?.syntheticBaseline) continue;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(row?.date || '')) throw new Error('Invalid StatVault date.');
            parseUtc(row.date + 'T00:00:00Z');
            const clean = { date: row.date };
            for (const key of ['lvl', 'xp', 'sp', 'rc', 'dmg', 'dmgMax']) {
                if (row[key] == null) continue;
                if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0) throw new Error(`Invalid StatVault ${key} value.`);
                clean[key] = row[key];
            }
            byDate.set(clean.date, clean);
        }
        return { userId, characterName, dailyStats: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) };
    }

    function summarizeStatWeek(dailyStats, week, now = Date.now()) {
        const start = parseUtc(week + 'T00:00:00Z');
        if (weekStartUtc(week + 'T00:00:00Z') !== week) throw new Error('Week must begin on Monday.');
        const endDate = new Date(start + WEEK).toISOString().slice(0, 10);
        const today = new Date(now).toISOString().slice(0, 10);
        const rows = dailyStats.filter(r => !r.syntheticBaseline && r.date >= week && r.date < endDate && r.date <= today).sort((a, b) => a.date.localeCompare(b.date));
        const baselineDate = new Date(start - DAY).toISOString().slice(0, 10);
        const baseline = dailyStats.find(r => r.date === baselineDate && !r.syntheticBaseline);
        const latest = rows.at(-1);
        const sum = field => rows.some(r => Number.isFinite(r[field])) ? rows.reduce((s, r) => s + (r[field] || 0), 0) : null;
        const gain = field => baseline && latest && Number.isFinite(baseline[field]) && Number.isFinite(latest[field]) && latest[field] >= baseline[field] ? latest[field] - baseline[field] : null;
        return {
            observedDays: new Set(rows.map(r => r.date)).size,
            expectedDays: Math.max(0, Math.min(7, Math.floor((now - start) / DAY) + 1)),
            raids: sum('rc'), damage: sum('dmg'),
            maxDamage: rows.some(r => Number.isFinite(r.dmgMax)) ? Math.max(...rows.map(r => r.dmgMax || 0)) : null,
            levelGain: gain('lvl'), xpGain: gain('xp'), spGain: gain('sp'),
            baselineDate: baseline?.date || null, lastDate: latest?.date || null,
            partial: now < start + WEEK
        };
    }

    function readStatsStore() {
        try {
            const raw = JSON.parse(localStorage.getItem(STATS_KEY) || '[]');
            if (!Array.isArray(raw) || raw.length > 200) return [];
            return raw.map(r => ({ ...normalizeStatImport(r), receivedAt: String(r.receivedAt || ''), source: String(r.source || 'import') }));
        } catch { return []; }
    }

    function mergeStatDays(existing, incoming) {
        // Both inputs contain normalized daily rows. Omitted fields represent
        // unavailable measurements, not instructions to erase known values.
        const days = new Map();
        for (const rows of [existing, incoming]) for (const row of rows) {
            days.set(row.date, { ...days.get(row.date), ...row });
        }
        return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    }

    function validateActivityQuery(query) {
        if (!query || !Array.isArray(query.members) || !query.members.length || query.members.length > 100) throw new Error('Select 1–100 members for a StatVault batch.');
        for (const member of query.members) {
            if (!member || typeof member.characterName !== 'string' || !member.characterName.trim() || member.characterName.length > 150 || (member.id !== undefined && (typeof member.id !== 'string' || !member.id.trim() || member.id.length > 150))) throw new Error('Invalid StatVault member identity.');
        }
        const start = joinDateMs(query.fromDate), end = joinDateMs(query.toDateExclusive);
        if (end <= start || end - start > 732 * DAY || query.includeBaseline !== true) throw new Error('StatVault supports a maximum of 732 days per request.');
        return { members: query.members.map(m => ({ characterName: m.characterName, ...(m.id === undefined ? {} : { id: m.id }) })), fromDate: query.fromDate, toDateExclusive: query.toDateExclusive, includeBaseline: true };
    }

    function normalizeActivitySummary(payload, query) {
        query = validateActivityQuery(query);
        if (!payload || payload.schemaVersion !== 1 || payload.timezone !== 'UTC' || payload.fromDate !== query.fromDate || payload.toDateExclusive !== query.toDateExclusive || payload.includeBaseline !== true || !Array.isArray(payload.members) || payload.members.length !== query.members.length || typeof payload.asOf !== 'string' || !payload.asOf.endsWith('Z')) throw new Error('Invalid StatVault summary response.');
        parseUtc(payload.asOf);
        const today = payload.asOf.slice(0, 10);
        const members = payload.members.map((entry, i) => {
            const requested = query.members[i];
            if (!entry || entry.requested?.characterName !== requested.characterName || entry.requested?.id !== requested.id || !['ok', 'unavailable', 'ambiguous'].includes(entry.status) || !Array.isArray(entry.dailyStats) || entry.dailyStats.length > 733) throw new Error('Invalid StatVault member response.');
            if (entry.status !== 'ok') {
                if (entry.user !== null || entry.dailyStats.length) throw new Error('Unexpected StatVault history for an unresolved member.');
                return { requested, status: entry.status, user: null, dailyStats: [] };
            }
            if (typeof entry.user?.id !== 'string' || !entry.user.id.trim() || entry.user.id.length > 150 || typeof entry.user?.characterName !== 'string' || !entry.user.characterName.trim() || entry.user.characterName.length > 150 || (requested.id && entry.user.id !== requested.id)) throw new Error('Invalid StatVault resolved identity.');
            if (!requested.id && entry.user.characterName !== requested.characterName) throw new Error('StatVault returned a mismatched character name.');
            let previous = '', baselines = 0;
            const dailyStats = entry.dailyStats.map(row => {
                joinDateMs(row?.date);
                if (row.date <= previous || row.date >= query.toDateExclusive || row.date > today || (row.date < query.fromDate && ++baselines > 1)) throw new Error('Invalid StatVault summary dates.');
                if (row.lvl !== null && (!Number.isSafeInteger(row.lvl) || row.lvl < 0)) throw new Error('Invalid StatVault level snapshot.');
                if (![true, false, null].includes(row.changedFromPrevious)) throw new Error('Invalid StatVault activity signal.');
                if (row.previousRecordedDate !== null) {
                    joinDateMs(row.previousRecordedDate);
                    if (row.previousRecordedDate >= row.date) throw new Error('Invalid StatVault predecessor date.');
                } else if (row.changedFromPrevious !== null) throw new Error('Activity without a comparison record is unknown.');
                if (previous ? row.previousRecordedDate !== previous : row.date >= query.fromDate && row.previousRecordedDate !== null) throw new Error('Incomplete StatVault comparison history.');
                previous = row.date;
                return { date: row.date, lvl: row.lvl, changedFromPrevious: row.changedFromPrevious, previousRecordedDate: row.previousRecordedDate };
            });
            return { requested, status: entry.status, user: { id: entry.user.id, characterName: entry.user.characterName }, dailyStats };
        });
        return { schemaVersion: 1, asOf: payload.asOf, timezone: 'UTC', fromDate: query.fromDate, toDateExclusive: query.toDateExclusive, includeBaseline: true, members };
    }

    function summarizeActivityPeriod(dailyStats, period, now = Date.now()) {
        const start = joinDateMs(period.start), end = joinDateMs(period.endExclusive);
        if (end <= start || !Number.isFinite(now)) throw new Error('Invalid activity period.');
        const today = new Date(now).toISOString().slice(0, 10);
        const sorted = [...dailyStats].filter(r => !r.syntheticBaseline && r.date <= today).sort((a, b) => a.date.localeCompare(b.date));
        const baseline = sorted.filter(r => r.date < period.start).at(-1);
        const rows = sorted.filter(r => r.date >= period.start && r.date < period.endExclusive);
        const latest = rows.at(-1);
        const comparable = rows.filter(r => r.changedFromPrevious === true || r.changedFromPrevious === false);
        const baselineExact = baseline?.date === new Date(start - DAY).toISOString().slice(0, 10);
        return {
            recordedDays: new Set(rows.map(r => r.date)).size,
            comparableDays: comparable.length,
            changedDays: comparable.length ? comparable.filter(r => r.changedFromPrevious).length : null,
            expectedDays: Math.max(0, Math.min((end - start) / DAY, Math.floor((now - start) / DAY) + 1)),
            levelGain: baseline && latest && Number.isSafeInteger(baseline.lvl) && Number.isSafeInteger(latest.lvl) ? latest.lvl - baseline.lvl : null,
            latestLevel: Number.isSafeInteger(latest?.lvl) ? latest.lvl : null,
            lastDate: latest?.date || null, baselineDate: baseline?.date || null, baselineExact, partial: now < end
        };
    }

    function localActivityDays(history) {
        const rows = history?.dailyStats || [];
        const fields = ['lvl', 'xp', 'sp', 'rc', 'dmg', 'dmgMax'];
        return rows.map((row, i) => {
            const prev = rows[i - 1];
            const known = prev ? fields.filter(f => Number.isFinite(row[f]) && Number.isFinite(prev[f])) : [];
            const changed = known.some(f => row[f] !== prev[f]);
            return { date: row.date, lvl: Number.isSafeInteger(row.lvl) ? row.lvl : null, changedFromPrevious: known.length === fields.length ? changed : null, previousRecordedDate: prev?.date || null };
        });
    }

    async function requestActivitySummary(query, { signal, fetchImpl = fetch } = {}) {
        query = validateActivityQuery(query);
        abortCheck(signal);
        const controller = new AbortController();
        const cancel = () => controller.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        const timeout = setTimeout(cancel, 30000);
        try {
            const response = await fetchImpl(ACTIVITY_API, {
                method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(query), signal: controller.signal
            });
            abortCheck(controller.signal);
            abortCheck(signal);
            if (!response.ok) {
                const retry = response.headers.get('Retry-After');
                const seconds = retry && /^\d+$/.test(retry) ? +retry : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : 60;
                const error = new Error(response.status === 429 ? 'StatVault rate limit reached. Wait before refreshing again.' : response.status === 503 ? 'StatVault summary service is not available yet.' : `StatVault summary returned HTTP ${response.status}.`);
                error.status = response.status;
                if (response.status === 429) error.retryAt = Date.now() + Math.max(1, Math.min(86400, Number.isFinite(seconds) ? seconds : 60)) * 1000;
                throw error;
            }
            const clean = normalizeActivitySummary(await response.json(), query);
            abortCheck(controller.signal);
            abortCheck(signal);
            return clean;
        } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
    }

    function saveStatsSnapshot(value, source = 'import', receivedAt = new Date().toISOString()) {
        const clean = normalizeStatImport(value);
        const saved = readStatsStore();
        const index = saved.findIndex(r => r.userId === clean.userId);
        const old = index < 0 ? null : saved[index];
        if (old?.receivedAt > receivedAt) return;
        const merged = { ...clean, dailyStats: mergeStatDays(old?.dailyStats || [], clean.dailyStats), receivedAt, source };
        if (index < 0) saved.push(merged); else saved[index] = merged;
        if (saved.length > 200) throw new Error('Local activity history supports up to 200 characters. Export and remove old histories first.');
        localStorage.setItem(STATS_KEY, JSON.stringify(saved));
        document.dispatchEvent(new CustomEvent('dotv:guild-activity:updated'));
    }

    function observeStatVault() {
        // A passive tap of StatVault's existing page-fetch sync. Return the exact
        // original promise immediately; never send, delay, retry or change it.
        const original = window.fetch;
        if (typeof original !== 'function') return;
        window.fetch = function (...args) {
            let observed = null;
            try {
                const [input, init] = args;
                const url = new URL(typeof input === 'string' ? input : input.url, location.href);
                if (url.origin === 'https://statvault-sync.mattias-cb7.workers.dev' && url.pathname === '/sync' && String(init?.method || input?.method || 'GET').toUpperCase() === 'POST' && typeof init?.body === 'string') {
                    const request = JSON.parse(init.body);
                    observed = { user: { id: request.user?.id, characterName: request.user?.characterName }, dailyStats: request.dailyStats, startedAt: new Date().toISOString() };
                    normalizeStatImport(observed);
                }
            } catch { observed = null; }
            const result = Reflect.apply(original, this, args);
            if (observed) Promise.resolve(result).then(response => {
                if (!response.ok) return;
                return response.clone().json().then(body => {
                    if (!body.ok) return;
                    const snapshots = Array.isArray(body.dailyStats) ? body.dailyStats : observed.dailyStats;
                    saveStatsSnapshot({ user: observed.user, dailyStats: snapshots }, 'StatVault sync (passive)', observed.startedAt);
                });
            }).catch(() => { }); // Optional integration must never affect StatVault.
            return result;
        };
        document.addEventListener('dotv:statvault:snapshot', event => {
            try { if (typeof event.detail === 'string' && event.detail.length <= 5000000) saveStatsSnapshot(JSON.parse(event.detail), 'StatVault local bridge'); } catch { }
        });
        document.dispatchEvent(new CustomEvent('dotv:statvault:request'));
    }

    async function requestDonationPage({ page, pageSize, signal }, expectedToken) {
        for (let attempt = 0; attempt < 4; attempt++) {
            abortCheck(signal);
            if (localStorage.token !== expectedToken) throw new Error('Account changed. Reopen Guild Activity Monitor.');
            const controller = new AbortController();
            const cancel = () => controller.abort();
            signal?.addEventListener('abort', cancel, { once: true });
            const timer = setTimeout(cancel, 20000);
            let retryMs = 700 * 2 ** attempt;
            try {
                const response = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: /^Bearer\s/i.test(expectedToken) ? expectedToken : `Bearer ${expectedToken}` },
                    body: JSON.stringify({ page, pageSize, filterString: '', transactionType: 1 }),
                    signal: controller.signal,
                    cache: 'no-store',
                    redirect: 'error'
                });
                if (response.status === 401 || response.status === 403) throw Object.assign(new Error('Donation access denied or login expired. Sign in and reopen Guild Activity Monitor.'), { terminal: true });
                if (!response.ok) {
                    const retryAfter = response.headers.get('Retry-After');
                    if (retryAfter) retryMs = Math.max(retryMs, Math.min(60000, /^\d+$/.test(retryAfter) ? +retryAfter * 1000 : Date.parse(retryAfter) - Date.now() || 0));
                    throw Object.assign(new Error(`Donation API returned HTTP ${response.status} on page ${page}.`), { terminal: response.status !== 429 && response.status < 500 });
                }
                const result = await response.json();
                if (result.success !== true || !result.payload) throw Object.assign(new Error(String(result.errorMsg || 'Donation API returned an unsuccessful response.')), { terminal: true });
                if (localStorage.token !== expectedToken) throw Object.assign(new Error('Account changed. Reopen Guild Activity Monitor.'), { terminal: true });
                return result.payload;
            } catch (error) {
                abortCheck(signal);
                if (error.terminal || attempt === 3) throw error;
            } finally {
                clearTimeout(timer);
                signal?.removeEventListener('abort', cancel);
            }
            await delay(retryMs, signal);
        }
    }

    const CSS = `
      :host{all:initial;box-sizing:border-box;position:fixed;left:50%;top:var(--monitor-top,12px);width:min(1480px,calc(100% - 24px));height:var(--monitor-height,calc(100dvh - 24px));transform:translateX(-50%);z-index:2147483000;color:#e3eaf3;font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color-scheme:dark}
      *{box-sizing:border-box}
      button,input,select{font:inherit}
      button,select,input{border:1px solid #43516a;border-radius:6px;background:#18243a;color:#e3eaf3;padding:6px 9px}
      button{cursor:pointer;transition:background-color .12s,border-color .12s}
      button:hover:not(:disabled){background:#293b53;border-color:#bda475}
      button:disabled{opacity:.45;cursor:default}
      :focus-visible{outline:2px solid #f0ce85;outline-offset:2px}
      select,input{min-width:0;max-width:100%}
      input[type=number]{width:82px}
      input[type=checkbox]{width:16px;height:16px;accent-color:#d8b77b;flex-shrink:0;margin:0}
      input[type=date]{color-scheme:dark}
      label{display:flex;align-items:center;gap:7px;color:#bdcbdd;font-size:12px;font-weight:500}
      h1{font:700 20px/1.18 Georgia,serif;margin:0;color:#efd7a8}
      h2{font-size:17px;line-height:1.25;margin:0;font-weight:650;letter-spacing:-.2px}
      p{margin:0}
      .muted{color:#acbdd1}
      .small{font-size:12px}
      .gold{color:#e7c58a}
      .primary{background:#d5b57c;color:#101827;border-color:#d5b57c;font-weight:650}
      .primary:hover:not(:disabled){background:#ebd19f;color:#101827}
      .quiet{background:transparent;border-color:#39465d}

      .app{position:relative;display:grid;grid-template-columns:252px minmax(0,1fr);height:100%;min-height:0;min-width:0;border:1px solid #61573f;border-radius:11px;background:#0d1625;box-shadow:0 18px 75px #000c;overflow:hidden}
      .dialog-close{position:absolute;top:8px;right:8px;z-index:30;display:grid;place-items:center;width:32px;height:32px;padding:0;border:1px solid #b4404c;border-radius:6px;background:#3f1d29;color:#ff7d8b;font-size:23px;font-weight:700;line-height:1;box-shadow:0 2px 5px #0005}
      .dialog-close:hover:not(:disabled){background:#672635;border-color:#ff8190;color:#ffb0b8}
      .sidebar{display:flex;flex-direction:column;min-height:0;min-width:0;background:#111c2d;border-right:1px solid #344359;overflow:hidden}
      .sidebar-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:15px 14px 13px;border-bottom:1px solid #2b394d;flex-shrink:0}
      .sidebar-top>div{min-width:0}
      .sidebar-top h1{margin-bottom:6px}
      .sidebar-top p{overflow-wrap:anywhere}
      .sidebar-top button{flex-shrink:0;padding:3px 7px;min-width:29px;line-height:21px}
      .eyebrow{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#bda881;margin-bottom:6px}
      .sidebar-scroll{display:flex;flex-direction:column;gap:14px;padding:13px 14px;overflow:auto;min-height:0;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#586a83 #111c2d}
      .sidebar-scroll>*{flex-shrink:0;min-width:0}
      .section-title,.control-title{font-size:11px;line-height:1.4;letter-spacing:.35px;color:#b5c4d7;font-weight:650}
      .tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
      .tabs button{position:relative;border-color:#2b3a50;background:#172338;color:#bdcbdc;text-align:left;padding:7px 8px;font-size:13px;line-height:18px;min-width:0;min-height:34px;border-radius:6px;white-space:nowrap}
      .tabs button:hover:not(:disabled){background:#1b2a40;border-color:#34445b;color:#edf2f8}
      .tabs button[aria-selected=true],.tabs button[aria-current=page]{background:#29354a;color:#f2d59f;border-color:#716140;font-weight:650}
      .tabs button[aria-selected=true]:before,.tabs button[aria-current=page]:before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:0 3px 3px 0;background:#dcc08b}

      .data-status{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:10px 14px;background:#152135;border-bottom:1px solid #2b394d;color:#b6c7d9;font-size:12px;flex-shrink:0;min-width:0}
      .data-status>div,.data-status>p,.data-status>span{min-width:0;overflow-wrap:anywhere}
      .data-status button{flex-shrink:0;font-size:12px;padding:5px 8px}
      .data-status .status{padding:0;border:0;background:transparent}
      .data-status .status.error{color:#ffcbd0}
      .data-status progress{width:100%;height:5px;margin-top:5px;accent-color:#d8b77b}
      .sidebar-scroll>.data-status{margin:-3px 0 0;padding:0 0 12px;background:transparent;border-top:0}
      .filters,.view-controls,.time-controls{display:flex;flex-direction:column;gap:10px;min-width:0}
      .filters{padding-top:13px;border-top:1px solid #2b394d}
      .view-controls:empty{display:none}
      .filters label,.view-controls label,.time-controls label,.options-body label{display:flex;flex-direction:column;align-items:stretch;gap:5px;min-width:0}
      .filters label:has(input[type=checkbox]),.view-controls label:has(input[type=checkbox]),.options-body label:has(input[type=checkbox]){flex-direction:row;align-items:center;gap:8px;line-height:1.45}
      .filters select,.filters input[type=number],.view-controls select,.view-controls input[type=number],.time-controls select,.time-controls input[type=number],.options-body select,.options-body input[type=number]{width:100%;max-width:100%;min-height:33px}
      .filter-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
      .segmented{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:3px;gap:3px;background:#0c1524;border:1px solid #35445a;border-radius:7px}
      .segmented button{min-width:0;border:0;background:transparent;padding:5px 7px;color:#b8c8da;font-size:12px}
      .segmented button[aria-pressed=true],.segmented button[aria-selected=true],.segmented button.active{background:#33425b;color:#f6e0b7;box-shadow:0 1px 3px #0005}
      .period-nav{display:grid;grid-template-columns:34px minmax(0,1fr) 34px;gap:5px}
      .period-nav button{min-width:0;min-height:31px;padding:4px 5px;font-size:12px}
      .period-nav button:first-child,.period-nav button:last-child{font-size:16px}
      .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .actions button{font-size:12px;padding:6px;min-height:32px;min-width:0;overflow-wrap:anywhere}
      .actions .primary,.actions [data-action=refresh]{grid-column:1/-1}
      .view-controls>.actions{margin-top:2px}
      .view-controls>button{width:100%;font-size:12px}
      .view-controls>.gold{font-size:16px;line-height:1.3;font-variant-numeric:tabular-nums}
      .sidebar-summary{display:flex;flex-wrap:wrap;gap:4px 10px;padding:10px 11px;background:#1a293e;border:1px solid #34435b;border-radius:7px;font-size:12px;line-height:1.5;color:#b8c9de}
      .sidebar-summary strong{font-weight:650;color:#f0d8ad;font-variant-numeric:tabular-nums}
      .sidebar-summary>strong{display:block;width:100%;font-size:18px;line-height:1.3}
      .sidebar-summary>p,.sidebar-summary>div{width:100%;min-width:0}
      .kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .card{min-width:0;background:#1a293e;border:1px solid #34435b;border-radius:7px;padding:9px}
      .card strong{display:block;font-size:18px;line-height:1.25;color:#f0d8ad;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
      .card span{display:block;margin-top:4px;font-size:12px;color:#b8c9de}
      .legend{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;font-size:12px;line-height:1.4;color:#b6c5d9}
      .legend>span{display:inline-flex;align-items:center}
      .dot{height:10px;width:10px;border-radius:3px;display:inline-block;margin-right:5px;background:#ddc986;flex-shrink:0}
      .dot.red{background:#dca7ab}

      .options-block,.export-block,.help-block{font-size:12px;line-height:1.5;color:#afc1d6;padding-top:12px;border-top:1px solid #2b394d;overflow-wrap:anywhere}
      .options-block summary,.export-block summary,.help-block summary{cursor:pointer;color:#c5d2e2;font-weight:550;list-style-position:outside;margin-left:13px;padding:1px 0}
      .options-block[open] summary,.export-block[open] summary,.help-block[open] summary{margin-bottom:11px;color:#e8d5ae}
      .options-body{display:flex;flex-direction:column;gap:11px}
      .options-block p+p,.export-block p+p,.help-block p+p{margin-top:10px}
      .help-block .link{color:#d6e2ef}
      .export-block .actions{margin-top:8px}
      .status{font-size:12px;line-height:1.5;color:#c0cee0;padding:9px 11px;border:1px solid #374960;border-radius:6px;overflow-wrap:anywhere;background:#19273c}
      .status.error,.error{color:#ffd2d6;background:#402735;border-color:#83515d}
      .status progress{display:block;width:100%;height:6px;margin-top:7px;accent-color:#d8b77b}
      .footer{display:flex;flex-direction:column;gap:8px;align-items:flex-start;border-top:1px solid #2b394d;padding-top:12px;overflow-wrap:anywhere}
      .footer .small{font-size:11px;color:#9daec3}

      .content{display:flex;flex-direction:column;gap:10px;min-height:0;min-width:0;overflow:hidden;padding:12px}
      .workspace-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-shrink:0;min-width:0;min-height:39px;padding:0 42px 2px 2px}
      .workspace-heading>div{min-width:0}
      .workspace-heading h2{color:#edf1f7;font-size:18px;line-height:1.25;letter-spacing:-.25px}
      .workspace-heading p{margin-top:4px;color:#b2c1d5;font-size:12px;line-height:1.4;overflow-wrap:anywhere}
      .scope-reset{flex-shrink:0;font-size:12px;padding:5px 8px}
      .workspace-message{flex-shrink:0;min-width:0}
      .workspace-message:empty{display:none}
      .view-body{display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;min-width:0;overflow:hidden}
      .table-wrap{flex:1;min-height:0;min-width:0;overflow:auto;border:1px solid #3a485f;border-radius:7px;background:#101b2c;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#62738d #152035;scroll-padding-top:48px;scroll-padding-bottom:36px}
      .table-wrap:focus-visible{outline-offset:-3px}
      table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
      th,td{padding:7px 11px;white-space:nowrap;text-align:right;border-bottom:1px solid #2d3a50;line-height:18px;vertical-align:middle}
      th{position:sticky;top:0;z-index:6;background:#243248;color:#dce5f0;font-size:12px;font-weight:650;white-space:normal;line-height:17px;box-shadow:0 1px 0 #44536b}
      th button[data-period]{white-space:nowrap}
      .period-link{display:inline-flex;flex-direction:column;align-items:flex-end;gap:3px;text-decoration:none;min-width:105px}
      .period-date{font-weight:650;text-decoration:underline;text-decoration-color:#667f9e;text-underline-offset:3px;white-space:nowrap}
      .period-meta{display:flex;align-items:center;gap:6px;font-size:11px;line-height:16px;font-weight:400;color:#b7c6d9;white-space:nowrap}
      .period-meta .partial{margin-left:0}
      td.sticky .period-link{align-items:flex-start}
      .period-link:hover .period-date{text-decoration-color:#d1b582}
      tbody td{background:#111d2f}
      tbody tr:nth-child(even) td{background:#19263a}
      tbody tr:hover td:not(.num-zero):not(.num-low){background:#26374d}
      td:first-child,th:first-child{text-align:left}
      th.sticky,td.sticky{position:sticky;left:0;background:#1d2b40;z-index:2;min-width:136px;border-right:1px solid #39485e}
      tbody tr:nth-child(even) td.sticky{background:#233148}
      th.sticky{z-index:7;background:#243248}
      td.total,th.total{background:#28394e;color:#f1d4a0;font-weight:650;border-left:1px solid #53647d}
      tfoot td{position:sticky;bottom:0;background:#2c3e53!important;font-weight:650;color:#f5dba7;z-index:4;border-top:1px solid #62728b;border-bottom:0}
      tfoot td.sticky{z-index:5;background:#2c3e53!important}
      .compact tbody td{padding-top:3px;padding-bottom:3px;line-height:18px}
      .compact thead th,.compact tfoot td{padding-top:7px;padding-bottom:7px}
      .compact td input,.compact td select{padding:2px 6px;font-size:12px;line-height:19px;min-height:26px}
      .comfortable tbody td{padding-top:8px;padding-bottom:8px;line-height:18px}
      .comfortable td input,.comfortable td select{font-size:13px;min-height:30px;padding:4px 7px}
      .partial{display:inline-block;font-size:10px;font-weight:550;letter-spacing:.2px;color:#f0d69d;background:#51442c;border:1px solid #756442;border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:middle;line-height:13px}
      .num-zero{background:#dca7ab!important;color:#571e2a!important;font-weight:650}
      .num-low{background:#ddc986!important;color:#4b3a11!important;font-weight:650}
      .link{border:0;padding:0;background:transparent!important;color:#d3e1f2;text-decoration:underline;text-decoration-color:#667f9e;text-underline-offset:3px;font:inherit;line-height:inherit}
      .link:hover:not(:disabled){color:#f7db9f;text-decoration-color:#d1b582}
      td.sticky .link{font-weight:550}
      .left{text-align:left}
      .notice{font-size:12px;line-height:1.5;color:#b2c2d6}
      .cell-sub,.cell-note{display:block;margin-top:2px;font-size:12px;line-height:16px;color:#acbed4;font-weight:400}
      th .cell-sub,th .cell-note{color:#bbcadc;font-size:11px;line-height:15px}
      .metric,.cell-value{font-weight:650;font-variant-numeric:tabular-nums}
      .date-stack{display:inline-block;white-space:nowrap;line-height:18px}
      .date-stack .cell-note{margin-top:0}
      .num-zero .cell-sub,.num-zero .cell-note{color:#682d36}
      .num-low .cell-sub,.num-low .cell-note{color:#655021}
      .status-badge{display:inline-block;padding:2px 7px;border:1px solid #516278;border-radius:5px;background:#24364b;color:#c9d6e7;font-size:12px;line-height:17px;white-space:nowrap}
      .status-badge.known,.status-badge.available{border-color:#456f64;background:#203e3b;color:#b8e0ca}
      .status-badge.unknown,.status-badge.unavailable{color:#c5d0df;background:#283345;border-color:#516074}
      .positive{color:#b5dbc4}
      .building-toggle{display:inline-flex;align-items:center;gap:7px;text-align:left}
      .building-toggle>span{width:10px;flex-shrink:0;color:#e0c38d;text-decoration:none}
      .building-summary .building-summary-row>td{background:#17253a}
      .building-summary .building-summary-row:hover>td{background:#26374d}
      .building-summary .building-detail-row[hidden]{display:none}
      .building-summary .building-detail-cell{padding:12px;background:#0c1626;white-space:normal}
      .building-detail{display:flex;flex-direction:column;gap:9px;min-width:0}
      .building-detail-heading{font-size:12px;font-weight:600;text-align:left;overflow-wrap:anywhere}
      .building-detail-heading .muted{font-weight:400}
      .building-detail .building-donors{flex:none;max-height:280px;scroll-padding-top:35px;scroll-padding-bottom:0}

      .empty{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-width:0;padding:32px 20px;text-align:center;border:1px dashed #465771;border-radius:8px;color:#bbcadc}
      .empty p{max-width:480px;font-size:13px;line-height:1.6}
      .split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;flex:1;min-height:0;min-width:0}
      .contribution-split{grid-template-columns:minmax(0,1.65fr) minmax(0,1fr)}
      .panel{min-height:0;min-width:0;display:flex;flex-direction:column;gap:9px}
      .panel>h2{padding:1px 2px;font-size:14px;line-height:1.4;color:#c5d2e3;font-weight:600}
      .bar{display:block;height:4px;background:#c6ab7b;border-radius:2px;margin-top:5px;max-width:100%}
      .trend-chart{display:flex;flex-direction:column;gap:6px;margin:0;padding:10px 12px 8px;height:160px;min-width:0;flex-shrink:0;border:1px solid #35445d;border-radius:7px;background:#142238}
      .trend-caption{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;font-size:12px;line-height:17px;color:#c4d1e2}
      .trend-caption strong{font-weight:600}
      .trend-key{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#c4b495;white-space:nowrap}
      .trend-key:before{content:"";width:20px;border-top:2px dashed #d8b97a}
      .trend-plot{display:grid;grid-template-columns:55px minmax(0,1fr);gap:8px;flex:1;min-height:0}
      .trend-scale{display:flex;flex-direction:column;justify-content:space-between;text-align:right;font-size:11px;line-height:14px;color:#aebfd5;font-variant-numeric:tabular-nums}
      .trend-canvas{position:relative;min-width:0;min-height:40px}
      .spark{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
      .trend-point{position:absolute;width:7px;height:7px;transform:translate(-50%,-50%);border-radius:50%;background:#dfc18b;border:1px solid #142238;pointer-events:none}
      .trend-point.unfinished{width:9px;height:9px;background:#142238;border:2px solid #dfc18b}
      .trend-dates{display:flex;justify-content:space-between;gap:10px;margin-left:63px;font-size:11px;line-height:15px;color:#b7c7db}
      .trend-dates span:last-child{text-align:right}
      .trend-dates.single{justify-content:center}
      .drill-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
      .transaction-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px}
      .transaction-footer button{padding:5px 8px;font-size:12px}
      .hidden{display:none!important}

      @media(max-width:1000px){
        .app{grid-template-columns:224px minmax(0,1fr)}
        .sidebar-top{padding:13px 12px}
        .sidebar-top h1{font-size:19px}
        .sidebar-scroll{padding:12px;gap:13px}
        .tabs button{padding-left:7px;padding-right:7px;font-size:12px}
        .data-status{padding-left:12px;padding-right:12px}
        .content{padding:10px}
        .split{grid-template-columns:minmax(0,1fr);grid-template-rows:1.5fr 1fr;overflow:auto}
        .split>.panel{min-height:230px}
        .filters,.view-controls{gap:9px}
      }
      @media(max-height:520px){
        .sidebar-top{padding-top:9px;padding-bottom:9px}
        .sidebar-top h1{font-size:18px}
        .sidebar-top .eyebrow{display:none}
        .sidebar-scroll{gap:12px;padding-top:10px;padding-bottom:10px}
        .content{padding:8px;gap:8px}
        .workspace-heading h2{font-size:16px}
        .trend-chart{height:130px}
        .split>.panel{min-height:160px}
      }
      @media(prefers-reduced-motion:reduce){button{transition:none}}
    `;

    function readGuildContext(root) {
        // Read already-loaded Vue state only; never invoke a game service.
        const candidates = [root, ...root.querySelectorAll('.guild-header,.guild-map-toolbar,.guild-name')];
        for (const element of candidates) {
            let instance = element.__vueParentComponent ?? element.__vue__?.$;
            const visited = new Set();
            while (instance && !visited.has(instance)) {
                visited.add(instance);
                const store = instance.setupState?.guildStore ?? instance.proxy?.guildStore;
                if (store?.myGuild?.id) return {
                    guildId: String(store.myGuild.id),
                    guildName: String(store.myGuild.name || ''),
                    userId: String(store.myMemberInfo?.userId || '')
                };
                instance = instance.parent;
            }
        }
        // Some production Vue builds omit element expandos but retain the root vnode.
        const stack = [document.querySelector('#ui')?._vnode];
        const visited = new Set();
        while (stack.length && visited.size < 2000) {
            const vnode = stack.pop();
            if (!vnode || visited.has(vnode)) continue;
            visited.add(vnode);
            const instance = vnode.component;
            const store = instance?.setupState?.guildStore;
            if (store?.myGuild?.id) return { guildId: String(store.myGuild.id), guildName: String(store.myGuild.name || ''), userId: String(store.myMemberInfo?.userId || '') };
            if (instance?.subTree) stack.push(instance.subTree);
            if (Array.isArray(vnode.children)) stack.push(...vnode.children);
        }
        return { guildId: '', userId: '', guildName: root.querySelector('.guild-name')?.textContent?.trim() || 'Guild' };
    }

    function createController(guildRoot, onDispose) {
        const host = document.createElement('div');
        host.id = 'dotv-guild-activity-monitor';
        const shadow = host.attachShadow({ mode: 'open' });
        document.body.append(host);
        const previousFocus = document.activeElement;
        const guildContext = readGuildContext(guildRoot);
        let prefs = {};
        try { prefs = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { }
        const guildSettingsKey = guildContext.guildId ? GUILD_SETTINGS_PREFIX + guildContext.guildId : '';
        let savedSettings;
        try { savedSettings = JSON.parse(localStorage.getItem(guildSettingsKey) || '{}'); } catch { }
        const settings = normalizeGuildSettings(savedSettings, prefs.goal);
        const state = { view: 'matrix', member: '', building: '', periodCount: 4, week: '', ...settings, snapshot: null, model: null, eligibleModel: null, loading: false, progress: null, error: '', message: '', controller: null, run: 0, txPage: 1, disposed: false, token: '', expandedBuilding: null };
        let localHistories = readStatsStore();
        Object.assign(state, { publicActivity: null, activityLoading: false, activityController: null, activityError: '', activityRun: 0, activityPeriod: '' });
        Object.assign(state, { compactRows: true });
        Object.assign(state, { focusStart: '', rangeCustom: false, txRange: null, goalDetails: false, activityDetails: false });
        let renderedView = '';
        const observationKey = guildContext.guildId ? SNAPSHOT_PREFIX + guildContext.guildId : '';
        const observed = () => { try { return JSON.parse(localStorage.getItem(observationKey) || '{}'); } catch { return {}; } };
        function statsUpdated() { localHistories = readStatsStore(); if (state.view === 'activity') render(); }
        document.addEventListener('dotv:guild-activity:updated', statsUpdated);
        const token = () => { try { return localStorage.token || ''; } catch { return ''; } };

        function clearActivityAccount() {
            state.activityController?.abort(); state.activityRun++; state.activityLoading = false; state.publicActivity = null; state.activityError = '';
        }

        function dispose() {
            if (state.disposed) return;
            state.disposed = true;
            state.controller?.abort();
            state.activityController?.abort();
            clearInterval(lifecycle);
            document.removeEventListener('dotv:guild-activity:updated', statsUpdated);
            host.remove();
            if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
            onDispose();
        }

        function close() {
            dispose();
        }

        function numClass(value, goal = state.goal) { return goal === 0 || value == null ? '' : value === 0 ? 'num-zero' : value < goal ? 'num-low' : ''; }
        const n = value => value == null ? '—' : fmt(value);
        function memberGoal(week, name) { return membershipGoalForWeek(week, state.joinDates[name], state.goal, state.joinWeekPolicy) ?? state.goal; }
        function creditedCell(week, name) { return state.eligibleModel?.cells.get(week)?.get(name) || 0; }
        function memberColor(week, name) { return numClass(creditedCell(week, name), memberGoal(week, name)); }
        function saveSettings() {
            if (!guildSettingsKey) { state.message = 'Settings apply for this session only: guild ID is unavailable.'; return; }
            try { localStorage.setItem(guildSettingsKey, JSON.stringify({ goal: state.goal, joinWeekPolicy: state.joinWeekPolicy, joinDates: state.joinDates })); state.message = 'Guild goals and join dates saved locally.'; }
            catch { state.error = 'Settings updated for this session but could not be saved to browser storage.'; }
        }
        function cell(week, name) { return state.model?.cells.get(week)?.get(name) || 0; }
        function chosenMembers() { return state.member ? [state.member] : state.model?.members || []; }
        function guildPeriods() {
            const current = buildPeriods({ count: 1 })[0];
            const weeks = [...new Set((state.model?.weeks || [current.start]).filter(start => start <= current.start))].sort().reverse();
            return (weeks.length ? weeks : [current.start]).map(start => ({ unit: 'week', start, endExclusive: new Date(joinDateMs(start) + WEEK).toISOString().slice(0, 10), label: start, isCurrent: start === current.start }));
        }
        function chosenPeriods() { return state.view === 'guild' ? guildPeriods() : buildPeriods({ count: state.periodCount }); }
        function chosenWeeks() {
            const periods = chosenPeriods();
            const first = joinDateMs(weekStartUtc(periods.at(-1).start + 'T00:00:00Z'));
            const end = joinDateMs(periods[0].endExclusive);
            const weeks = [];
            for (let ms = first; ms < end; ms += WEEK) weeks.unshift(new Date(ms).toISOString().slice(0, 10));
            return weeks;
        }
        const periodCache = new Map();
        function periodSummary(period, name) {
            const key = JSON.stringify([period.start, period.endExclusive]);
            if (!periodCache.has(key)) {
                const byMember = new Map();
                for (const row of periodTransactions(period, true)) {
                    const summary = byMember.get(row.characterName) || { recordedTokens: 0, creditedTokens: 0, transactionCount: 0 };
                    summary.recordedTokens += row.donatedTokenQty;
                    summary.creditedTokens += row.donatedTokenQty;
                    summary.transactionCount++;
                    byMember.set(row.characterName, summary);
                }
                periodCache.set(key, byMember);
            }
            return periodCache.get(key).get(name) || { recordedTokens: 0, creditedTokens: 0, transactionCount: 0 };
        }
        function beforeJoin(period, name) { return !!state.joinDates[name] && state.joinDates[name] >= period.endExclusive; }
        function periodCell(period, name) { return periodSummary(period, name).recordedTokens; }
        function periodCredited(period, name) { return periodSummary(period, name).creditedTokens; }
        function periodGoal(period, name) {
            // Without a confirmed join date, use the standard whole-period target.
            const joined = state.joinDates[name] || weekStartUtc(period.start + 'T00:00:00Z');
            return membershipGoalForPeriod(period, joined, state.goal, state.joinWeekPolicy);
        }
        function periodTotal(period) { return chosenMembers().reduce((sum, name) => sum + periodCell(period, name), 0); }
        function periodColor(period, name) { return numClass(periodCredited(period, name), periodGoal(period, name)); }
        function periodLabel(period) {
            const firstYear = period.start.slice(0, 4);
            const lastYear = new Date(joinDateMs(period.endExclusive) - DAY).getUTCFullYear().toString();
            const years = firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`;
            const dateLabel = readablePeriod(period).replace(/, \d{4}/g, '').replace(/ \d{4}$/, '');
            return `<span class="period-date">${esc(dateLabel)}</span><span class="period-meta">${years}${period.isCurrent ? '<span class="partial">In progress</span>' : ''}</span>`;
        }
        function selectedPeriod() { return focusedPeriod({ start: state.focusStart }); }
        function focusPeriods() {
            const weeks = guildPeriods();
            const count = Math.max(104, Math.round((joinDateMs(weeks[0].start) - joinDateMs(weeks.at(-1).start)) / WEEK) + 1);
            return buildPeriods({ count });
        }
        function setFocusedPeriod(period) { state.focusStart = period.start; }
        function focusWorkspace() { shadow.querySelector('.workspace-heading h2')?.focus({ preventScroll: true }); }
        function periodTransactions(period, allMembers = false) {
            const { start, end } = periodBounds(period);
            const now = Date.now();
            return dataRows().filter(row => { const at = parseUtc(row.timestamp); return at >= start && at < end && at <= now && (allMembers || !state.member || row.characterName === state.member); });
        }
        function weeklyTotal(week) { return state.member ? cell(week, state.member) : state.model.guildTotals.get(week) || 0; }
        function partial(week) { return week === state.model?.currentWeek; }
        function weekLabel(week) { return `${esc(week)}${partial(week) ? '<span class="partial">SO FAR</span>' : ''}`; }
        function options(items, selected) { return items.map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`).join(''); }
        function eligibleDonation(row) { return !state.joinDates[row.characterName] || parseUtc(row.timestamp) >= joinDateMs(state.joinDates[row.characterName]); }
        function dataRows() { return (state.snapshot?.transactions || []).filter(r => eligibleDonation(r) && (!state.building || r.buildingName === state.building)); }
        function recalc() {
            periodCache.clear();
            const all = state.snapshot.transactions;
            const names = [...new Set(all.map(r => r.characterName))];
            state.model = aggregateDonations(dataRows(), { memberNames: names });
            state.eligibleModel = aggregateDonations(dataRows().filter(r => !state.joinDates[r.characterName] || parseUtc(r.timestamp) >= joinDateMs(state.joinDates[r.characterName])), { memberNames: names });
            // Building filters keep the full export's date range so missing weeks stay visible.
            const full = aggregateDonations(all);
            state.model.weeks = full.weeks;
            const joinedWeeks = Object.entries(state.joinDates).filter(([name, date]) => names.includes(name) && date <= new Date().toISOString().slice(0, 10)).map(([, date]) => weekStartUtc(date + 'T00:00:00Z'));
            const firstWeek = [...full.weeks, ...joinedWeeks].sort()[0];
            for (let ms = Date.parse(full.weeks.at(-1) + 'T00:00:00Z') - WEEK, min = Date.parse(firstWeek + 'T00:00:00Z'); ms >= min && state.model.weeks.length <= 5200; ms -= WEEK) state.model.weeks.push(new Date(ms).toISOString().slice(0, 10));
            state.model.firstSeen = full.firstSeen;
            if (state.member && !names.includes(state.member)) state.member = '';
            if (!state.week || !full.weeks.includes(state.week)) state.week = full.currentWeek;
        }

        function matrixData() {
            const matrix = buildDonationMatrix(dataRows(), { periods: chosenPeriods(), members: chosenMembers(), joinDates: state.joinDates });
            if (state.member) matrix.at(-1)[0] = 'Selected total';
            return matrix;
        }

        function renderMatrix() {
            const members = chosenMembers();
            const periods = chosenPeriods();
            const label = 'Weekly donation matrix';
            const cellHtml = (period, name) => beforeJoin(period, name)
                ? `<td class="muted" title="Before ${esc(name)} joined on ${state.joinDates[name]}; excluded from all totals">N/A</td>`
                : `<td class="${periodColor(period, name)}" title="${esc(name)} · ${period.label} · ${fmt(periodCell(period, name))} eligible tokens · Goal ${fmt(periodGoal(period, name))}${state.joinDates[name] ? ' · Donations on or after ' + state.joinDates[name] + ' only' : ' · Join date unknown'}">${fmt(periodCell(period, name))}</td>`;
            return `<div class="table-wrap" tabindex="0" aria-label="${label}" data-scroll-key="matrix"><table aria-label="${label}"><thead><tr><th class="sticky">Member</th>${periods.map(p => `<th><button class="link period-link" aria-label="View buildings for ${esc(readablePeriod(p))}${p.isCurrent ? ' (in progress)' : ''}" data-period="${p.start}" title="${p.start} 00:00 UTC to ${p.endExclusive} 00:00 UTC (exclusive)">${periodLabel(p)}</button></th>`).join('')}<th class="total">Total</th></tr></thead><tbody>${members.map(name => `<tr><td class="sticky"><button class="link" data-member="${esc(name)}">${esc(name)}</button></td>${periods.map(p => cellHtml(p, name)).join('')}<td class="total">${fmt(periods.reduce((sum, p) => sum + periodCell(p, name), 0))}</td></tr>`).join('')}</tbody><tfoot><tr><td class="sticky">${state.member ? 'Selected total' : 'Guild total'}</td>${periods.map(p => `<td>${fmt(periodTotal(p))}</td>`).join('')}<td class="total">${fmt(periods.reduce((sum, p) => sum + periodTotal(p), 0))}</td></tr></tfoot></table></div>`;
        }

        function renderWeek() {
            const period = selectedPeriod();
            const buildings = new Map();
            const transactions = periodTransactions(period);
            for (const row of transactions) {
                const name = row.buildingName || 'Unknown building';
                if (!buildings.has(name)) buildings.set(name, { name, tokens: 0, donations: 0, donors: new Map() });
                const building = buildings.get(name);
                building.tokens += row.donatedTokenQty;
                building.donations++;
                building.donors.set(row.characterName, (building.donors.get(row.characterName) || 0) + row.donatedTokenQty);
            }
            const rows = [...buildings.values()].sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
            const totalTokens = transactions.reduce((sum, row) => sum + row.donatedTokenQty, 0);
            const totalDonors = new Set(transactions.map(row => row.characterName)).size;
            return `<div class="table-wrap building-summary" tabindex="0" aria-label="Weekly building donations" data-scroll-key="buildings"><table aria-label="Weekly building donations"><thead><tr><th scope="col" class="sticky">Building<span class="cell-note">Click to see donors</span></th><th scope="col">Donated tokens</th><th scope="col" title="Unique members who donated to this building in the selected week and filters">Donors</th><th scope="col" title="Number of donation transactions in the selected week and filters">Donations</th></tr></thead><tbody>${rows.map((building, index) => {
                const expanded = state.expandedBuilding === building.name;
                const detailId = `building-donors-${index}`;
                const donors = [...building.donors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
                return `<tr class="building-summary-row"><td class="sticky"><button class="link building-toggle" data-building-detail="${esc(building.name)}" aria-expanded="${expanded}" aria-controls="${detailId}" aria-label="${expanded ? 'Hide' : 'Show'} donors for ${esc(building.name)}"><span aria-hidden="true">${expanded ? '▾' : '▸'}</span>${esc(building.name)}</button></td><td class="cell-value">${fmt(building.tokens)}</td><td>${fmt(building.donors.size)}</td><td>${fmt(building.donations)}</td></tr><tr id="${detailId}" class="building-detail-row"${expanded ? '' : ' hidden'}><td colspan="4" class="building-detail-cell">${expanded ? `<section class="building-detail" aria-label="Donors for ${esc(building.name)}"><p class="building-detail-heading">${esc(building.name)} <span class="muted">· ${fmt(building.donors.size)} donors · ${fmt(building.tokens)} tokens</span></p><div class="table-wrap building-donors" tabindex="0" aria-label="Donors for ${esc(building.name)}" data-scroll-key="building-donors-${esc(building.name)}"><table aria-label="Donors for ${esc(building.name)}"><thead><tr><th scope="col" class="sticky">Member</th><th scope="col">Donated tokens</th></tr></thead><tbody>${donors.map(([name, tokens]) => `<tr><td class="sticky"><button class="link" data-member="${esc(name)}">${esc(name)}</button></td><td class="cell-value">${fmt(tokens)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}</td></tr>`;
            }).join('') || '<tr><td colspan="4" class="left">No donations recorded for this week and the selected filters.</td></tr>'}</tbody><tfoot><tr><td class="sticky">${state.member ? 'Selected member total' : 'Guild total'}</td><td>${fmt(totalTokens)}</td><td title="Unique donors across all buildings shown; members who donated to several buildings count once">${fmt(totalDonors)}</td><td>${fmt(transactions.length)}</td></tr></tfoot></table></div>`;
        }

        function renderGuild() {
            const periods = chosenPeriods();
            const history = [...periods].reverse();
            const max = Math.max(1, ...history.map(periodTotal));
            const points = history.map((period, index) => ({ period, x: history.length === 1 ? 500 : 8 + index * 984 / (history.length - 1), y: 96 - periodTotal(period) / max * 92 }));
            const coordinates = list => list.map(point => `${point.x},${point.y}`).join(' ');
            const completed = points.filter(point => !point.period.isCurrent);
            const current = points.at(-1).period.isCurrent ? points.at(-1) : null;
            const scaleUnit = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e4, 'k']].find(([threshold]) => max >= threshold);
            const scaleLabel = scaleUnit ? (max / (scaleUnit[1] === 'k' ? 1e3 : scaleUnit[0])).toLocaleString('en-US', { maximumFractionDigits: 1 }) + scaleUnit[1] : fmt(max);
            const axisDate = period => 'Week of ' + readableDateRange(period.start, new Date(joinDateMs(period.start) + DAY).toISOString().slice(0, 10));
            const chartLabel = `Weekly donated tokens, all history, oldest to newest: ${readablePeriod(history[0])}${history.length > 1 ? ' through ' + readablePeriod(history.at(-1)) : ''}. Scale 0 to ${fmt(max)} tokens. ${current ? 'Dashed line and hollow point mark the current, unfinished week. ' : ''}Exact values are in the newest-first table below.`;
            const chart = `<figure class="trend-chart" role="img" aria-label="${esc(chartLabel)}"><figcaption class="trend-caption"><strong>Donated tokens / week</strong>${current ? '<span class="trend-key">Current period unfinished</span>' : ''}</figcaption><div class="trend-plot"><div class="trend-scale" aria-hidden="true"><span title="${fmt(max)} tokens">${scaleLabel}</span><span>0</span></div><div class="trend-canvas"><svg class="spark" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><line x1="8" y1="4" x2="992" y2="4" stroke="#2c3d56" vector-effect="non-scaling-stroke"/><line x1="8" y1="96" x2="992" y2="96" stroke="#4b5d76" vector-effect="non-scaling-stroke"/>${completed.length > 1 ? `<polyline points="${coordinates(completed)}" fill="none" stroke="#d8b97a" stroke-width="2.5" vector-effect="non-scaling-stroke"/>` : ''}${current && points.length > 1 ? `<polyline points="${coordinates(points.slice(-2))}" fill="none" stroke="#d8b97a" stroke-width="2.5" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>` : ''}</svg>${points.filter((point, index) => points.length <= 12 || index === 0 || index >= points.length - 2).map(point => `<span class="trend-point${point.period.isCurrent ? ' unfinished' : ''}" style="left:${point.x / 10}%;top:${point.y}%" aria-hidden="true"></span>`).join('')}</div></div><div class="trend-dates${history.length === 1 ? ' single' : ''}" aria-hidden="true"><span>${esc(axisDate(history[0]))}</span>${history.length > 1 ? `<span>${esc(axisDate(history.at(-1)))}</span>` : ''}</div></figure>`;
            return `${chart}<div class="table-wrap" tabindex="0" aria-label="Guild donation trend" data-scroll-key="trend"><table aria-label="Guild donation trend"><thead><tr><th class="sticky">Week of Monday</th><th>Donated tokens</th><th>Contributors</th><th>Members at target</th><th>Change vs prior week</th></tr></thead><tbody>${periods.map((p, index) => {
                const prevPeriod = periods[index + 1];
                const prev = prevPeriod ? periodTotal(prevPeriod) : 0;
                const qty = periodTotal(p);
                return `<tr><td class="sticky"><button class="link period-link" aria-label="View buildings for ${esc(readablePeriod(p))}${p.isCurrent ? ' (in progress)' : ''}" data-period="${p.start}">${periodLabel(p)}</button></td><td>${fmt(qty)}<span class="bar" style="width:${100 * qty / max}%"></span></td><td>${chosenMembers().filter(m => periodCell(p, m) > 0).length}</td><td>${chosenMembers().filter(m => periodGoal(p, m) > 0 && periodCredited(p, m) >= periodGoal(p, m)).length} / ${chosenMembers().filter(m => periodGoal(p, m) > 0).length}</td><td>${p.isCurrent || !prev ? '—' : ((qty - prev) / prev * 100).toFixed(1) + '%'}</td></tr>`;
            }).join('')}</tbody></table></div>`;
        }

        function memberSummary() {
            // Goals are lifetime-in-guild, independent of display filters.
            const records = state.snapshot?.transactions || [];
            return chosenMembers().map(name => {
                const last = records.filter(r => r.characterName === name && eligibleDonation(r) && parseUtc(r.timestamp) <= Date.now()).map(r => r.timestamp).sort().at(-1);
                return { name, last, ...summarizeMemberGoals(records, { memberName: name, joinDate: state.joinDates[name], weeklyGoal: state.goal, joinWeekPolicy: state.joinWeekPolicy }) };
            });
        }

        function renderMembers() {
            const rows = memberSummary();
            const known = rows.filter(r => r.joinDate);
            const total = key => known.reduce((sum, row) => sum + row[key], 0);
            const unknown = '<span title="Set a join date to calculate this value" aria-label="Unknown; set a join date">—</span>';
            const value = amount => amount == null ? unknown : fmt(amount);
            const sum = key => known.length ? fmt(total(key)) : unknown;
            const detailHeads = '<th scope="col" title="Target from joining through the last completed week; excludes the current week">Completed goal</th><th scope="col" title="Completed-week goal minus donations from completed weeks, never below zero. Current-week donations are excluded.">Completed shortfall</th><th scope="col" title="The current Monday-to-Sunday target, adjusted for the member\'s join date">This week\'s goal</th><th scope="col" title="Completed weeks with a positive target and no credited donations">Zero weeks</th>';
            return `<div class="table-wrap" tabindex="0" aria-label="Member join dates and donation goals" data-scroll-key="members"><table aria-label="Member join dates and donation goals"><thead><tr><th scope="col" class="sticky">Member</th><th scope="col">Joined<span class="cell-note">UTC date</span></th><th scope="col" title="All donated tokens since the join date, across all buildings and all history">Donated<span class="cell-note">since joining</span></th><th scope="col" title="Cumulative target from the join date through the full current week, independent of display filters">Total goal<span class="cell-note">incl. this week</span></th><th scope="col" title="Total goal minus all donations since joining, never below zero. This is a cumulative amount and includes the current week's target.">Remaining<span class="cell-note">cumulative</span></th><th scope="col" title="Completed weeks that met their target, out of all completed weeks with a positive target">Weeks met<span class="cell-note">completed only</span></th>${state.goalDetails ? detailHeads : ''}</tr></thead><tbody>${rows.map(r => `<tr><td class="sticky"><button class="link" data-member="${esc(r.name)}">${esc(r.name)}</button></td><td><input type="date" data-join-member="${esc(r.name)}" aria-label="Join date for ${esc(r.name)}, UTC" title="Joining date in UTC. Leave blank if unknown." min="2000-01-01" max="${new Date().toISOString().slice(0, 10)}" value="${esc(r.joinDate || '')}"></td><td class="cell-value">${value(r.eligibleTokens)}</td><td>${value(r.totalGoal)}</td><td>${value(r.remaining)}</td><td>${r.joinDate ? fmt(r.weeksMet) + ' / ' + fmt(r.completedWeeks) : unknown}</td>${state.goalDetails ? `<td>${value(r.completedGoal)}</td><td>${value(r.completedShortfall)}</td><td>${value(r.currentGoal)}</td><td>${r.joinDate ? fmt(r.zeroWeeks) : unknown}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${state.goalDetails ? 10 : 6}">No members match the selected filter.</td></tr>`}</tbody><tfoot><tr><td class="sticky">${state.member ? 'Member total' : 'Configured total'}</td><td title="Only members with a known join date are included in these totals">${fmt(known.length)} with dates</td><td>${sum('eligibleTokens')}</td><td>${sum('totalGoal')}</td><td>${sum('remaining')}</td><td title="Individual weekly targets are evaluated per member">—</td>${state.goalDetails ? `<td>${sum('completedGoal')}</td><td>${sum('completedShortfall')}</td><td>${sum('currentGoal')}</td><td title="Individual zero-donation weeks are evaluated per member">—</td>` : ''}</tr></tfoot></table></div>`;
        }

        function statForMember(name) {
            const matches = localHistories.filter(h => h.characterName === name);
            // Character names aren't immutable IDs. Ambiguous imports remain unknown.
            return matches.length === 1 ? matches[0] : null;
        }

        function selectedActivityPeriod() {
            return selectedPeriod();
        }

        function activityQuery() {
            const selected = selectedActivityPeriod();
            // Prefetch the selected period and three preceding periods, independently
            // of the donation comparison range. Browsing cached dates stays local.
            const periods = buildPeriods({ unit: selected.unit, count: 4, now: joinDateMs(selected.start) });
            return validateActivityQuery({ members: (state.model?.members || []).map(characterName => ({ characterName })), fromDate: periods.at(-1).start, toDateExclusive: periods[0].endExclusive, includeBaseline: true });
        }

        function activityCovered() {
            const data = state.publicActivity;
            if (!data) return false;
            const period = selectedActivityPeriod();
            return data.fromDate <= period.start && data.toDateExclusive >= period.endExclusive && (state.model?.members || []).every(name => data.members.some(m => m.requested.characterName === name));
        }

        async function loadActivity() {
            if (state.disposed || state.activityLoading || !state.model) return;
            if (Date.now() < activityRetryAt) {
                state.activityError = `StatVault is rate limited. Try again in ${Math.ceil((activityRetryAt - Date.now()) / 1000)} seconds.`;
                render(); return;
            }
            const run = ++state.activityRun;
            const accountToken = token();
            state.activityError = '';
            state.activityLoading = true;
            state.activityController = new AbortController();
            render();
            try {
                const result = await requestActivitySummary(activityQuery(), { signal: state.activityController.signal });
                if (state.disposed || run !== state.activityRun || token() !== accountToken) return;
                state.publicActivity = result;
            } catch (error) {
                if (error.retryAt) activityRetryAt = Math.max(activityRetryAt, error.retryAt);
                if (state.disposed || run !== state.activityRun || token() !== accountToken) return;
                state.activityError = error.name === 'AbortError' ? 'Activity loading cancelled or timed out; no partial results were added.' : error.message;
            } finally {
                if (!state.disposed && run === state.activityRun) { state.activityLoading = false; state.activityController = null; render(); }
            }
        }

        function activityRows() {
            const period = selectedActivityPeriod();
            return chosenMembers().map(name => {
                const data = state.publicActivity;
                const covered = data && data.fromDate <= period.start && data.toDateExclusive >= period.endExclusive;
                const entry = covered ? data.members.find(m => m.requested.characterName === name) : null;
                const history = !entry || entry.status === 'unavailable' ? statForMember(name) : null;
                const days = entry?.status === 'ok' ? entry.dailyStats : history ? localActivityDays(history) : [];
                const source = history ? (entry ? 'Local (public unavailable)' : 'Local history') : entry ? (entry.status === 'ok' ? 'StatVault public' : entry.status === 'ambiguous' ? 'Ambiguous name' : 'Unavailable') : data ? 'Range not loaded' : 'Not loaded';
                return { name, source, stats: summarizeActivityPeriod(days, period), tokens: periodCell(period, name) };
            });
        }

        function renderActivity() {
            const rows = activityRows();
            const unknown = message => `<span title="${esc(message)}" aria-label="${esc(message)}">—</span>`;
            const dayLabel = date => date ? new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
            const dateCell = date => date ? `<time datetime="${date}" title="${date} (UTC date)">${dayLabel(date)}</time>` : unknown('No recorded date available');
            const statusHints = { 'Unavailable': 'No StatVault history', 'Ambiguous name': 'Name needs an exact match', 'Range not loaded': 'Date range not loaded', 'Not loaded': 'Activity not loaded', 'Local history': 'Local history', 'Local (public unavailable)': 'Local history · no public match' };
            return `<div class="table-wrap" tabindex="0" aria-label="Member activity by period" data-scroll-key="activity"><table aria-label="Member activity by period"><thead><tr><th scope="col" class="sticky">Member</th><th scope="col" title="Recorded days where stored stats changed from the preceding recorded day. This estimates activity, not confirmed logins.">Active days<span class="cell-note">estimated</span></th><th scope="col" title="Latest recorded level minus the real pre-period baseline. An asterisk means an earlier baseline may include gains before this period.">Level change<span class="cell-note">observed</span></th><th scope="col" title="Number of recorded dates in the selected period; not a count of logins">Recorded days</th><th scope="col" title="Level in the latest recorded entry within this period">Latest level</th><th scope="col">Last record<span class="cell-note">UTC date</span></th>${state.activityDetails ? '<th scope="col">Source / status</th><th scope="col" title="Most recent real recorded date before this period">Baseline<span class="cell-note">UTC date</span></th>' : ''}</tr></thead><tbody>${rows.map(({ name, source, stats: s }) => {
                const knownHistory = source === 'StatVault public' || source.startsWith('Local');
                const hint = statusHints[source];
                const comparisonTitle = `${fmt(s.comparableDays)} of ${fmt(s.recordedDays)} recorded days could be compared with a preceding record. Identical or incomplete records may undercount activity.`;
                const baselineTitle = s.baselineDate ? `Baseline: ${s.baselineDate} UTC; latest: ${s.lastDate || 'none'} UTC.${s.baselineExact ? '' : ' Earlier baseline may include level changes before this period.'} Level corrections can produce a negative value.` : 'No real pre-period level baseline is available; level change is unknown.';
                const levelText = s.levelGain == null ? unknown('Level change unknown; a valid baseline and in-period level are both required') : `${s.levelGain > 0 ? '+' : ''}${fmt(s.levelGain)}${s.baselineExact ? '' : ' *'}`;
                return `<tr><td class="sticky"><button class="link" data-member="${esc(name)}">${esc(name)}</button>${hint && !state.activityDetails ? `<span class="cell-note" title="${esc(source)}">${esc(hint)}</span>` : ''}</td><td class="cell-value" title="${comparisonTitle}">${s.changedDays == null ? unknown('Estimated activity unknown; no comparable recorded days') : fmt(s.changedDays)}</td><td class="cell-value" title="${baselineTitle}">${levelText}</td><td title="${fmt(s.expectedDays)} elapsed UTC days in this period${s.partial ? '; still in progress' : ''}">${knownHistory ? fmt(s.recordedDays) : unknown('Recorded-day coverage is unknown until history is available')}</td><td>${s.latestLevel == null ? unknown('No valid level recorded in this period') : fmt(s.latestLevel)}</td><td>${dateCell(s.lastDate)}</td>${state.activityDetails ? `<td>${esc(source)}</td><td>${dateCell(s.baselineDate)}</td>` : ''}</tr>`;
            }).join('') || `<tr><td colspan="${state.activityDetails ? 8 : 6}">No members match the selected filter.</td></tr>`}</tbody></table></div>`;
        }

        function recordCheckpoint() {
            if (!observationKey) return;
            const model = aggregateDonations(state.snapshot.transactions.filter(row => eligibleDonation(row) && parseUtc(row.timestamp) <= Date.now()));
            const history = observed();
            history[model.currentWeek] = {
                week: model.currentWeek,
                observedAt: state.snapshot.fetchedAt,
                guildId: guildContext.guildId,
                guildName: guildContext.guildName,
                guildTokens: model.guildTotals.get(model.currentWeek) || 0,
                members: Object.fromEntries(model.members.map(m => [m, model.cells.get(model.currentWeek)?.get(m) || 0]))
            };
            const kept = Object.fromEntries(Object.entries(history).sort(([a], [b]) => b.localeCompare(a)).slice(0, 156));
            try { localStorage.setItem(observationKey, JSON.stringify(kept)); }
            catch { state.message = 'History verified. Local checkpoint could not be saved (browser storage is full).'; }
        }

        function filteredTransactions() {
            const periods = chosenPeriods();
            const drill = state.txRange;
            const start = joinDateMs(drill?.start || periods.at(-1).start);
            const end = joinDateMs(drill?.endExclusive || periods[0].endExclusive);
            const now = Date.now();
            return dataRows().filter(r => { const at = parseUtc(r.timestamp); return (!state.member || r.characterName === state.member) && at >= start && at < end && at <= now; });
        }

        function renderTransactions() {
            const all = filteredTransactions();
            const pages = Math.max(1, Math.ceil(all.length / 100));
            state.txPage = Math.min(state.txPage, pages);
            const rows = all.slice((state.txPage - 1) * 100, state.txPage * 100);
            return `<div class="table-wrap" tabindex="0" aria-label="Donation transactions" data-scroll-key="transactions"><table aria-label="Donation transactions"><thead><tr><th scope="col" class="sticky">Member</th><th scope="col">Donated tokens</th><th scope="col">Building</th><th scope="col">When<span class="cell-note">UTC</span></th></tr></thead><tbody>${rows.map(r => {
                const at = new Date(parseUtc(r.timestamp));
                const date = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
                const time = at.toISOString().slice(11, 19);
                const detail = `${r.timestamp} UTC · Transaction ${r.transactionId} · Week of Monday ${weekStartUtc(r.timestamp)}`;
                return `<tr title="${esc(detail)}"><td class="sticky"><button class="link" data-member="${esc(r.characterName)}">${esc(r.characterName)}</button></td><td class="cell-value">${fmt(r.donatedTokenQty)}</td><td>${esc(r.buildingName || 'Unknown building')}</td><td><time class="date-stack" datetime="${at.toISOString()}" title="${esc(detail)}">${date}<span class="cell-note">${time}</span></time></td></tr>`;
            }).join('') || '<tr><td colspan="4">No donations match the selected filters.</td></tr>'}</tbody></table></div>`;
        }

        function statusText() {
            if (state.error) return esc(state.error);
            if (state.loading) {
                const p = state.progress;
                if (!p) return 'Requesting the first donation page…';
                return `${p.phase === 'restarting' ? 'History changed; restarting' : 'Loading donations'} · ${p.completed}/${p.totalPages} pages<progress max="${p.totalPages}" value="${p.completed}"></progress>`;
            }
            return state.snapshot ? `${fmt(state.snapshot.transactions.length)} donations verified` : 'No donation history loaded';
        }

        function updateStatus() {
            const el = shadow.getElementById('load-status');
            if (el) { el.innerHTML = statusText(); el.classList.toggle('error', !!state.error); }
        }

        const rangeChoices = [['week:4', 'Last 4 weeks'], ['week:8', 'Last 8 weeks'], ['week:12', 'Last 12 weeks'], ['custom', 'Custom range…']];

        function renderTimeControls() {
            if (state.view === 'members' || state.view === 'guild') return '';
            if (state.view === 'week' || state.view === 'activity') {
                const period = selectedPeriod();
                const periods = focusPeriods();
                const index = periods.findIndex(p => p.start === period.start);
                return `<section class="time-controls"><label>Week<select data-filter="focusStart" aria-label="Selected week">${options(periods.map(p => [p.start, readablePeriod(p) + (p.isCurrent ? ' · current' : '')]), period.start)}</select></label><div class="period-nav"><button data-action="previous-period" aria-label="Previous week" title="Previous week" ${index >= periods.length - 1 ? 'disabled' : ''}>←</button><button data-action="current-period" aria-label="Current week" ${period.isCurrent ? 'disabled' : ''}>Current</button><button data-action="next-period" aria-label="Next week" title="Next week" ${index <= 0 ? 'disabled' : ''}>→</button></div><p class="notice">Monday reset weeks · UTC${period.isCurrent ? ' · in progress' : ''}</p></section>`;
            }
            if (state.view === 'transactions' && state.txRange) return `<section class="time-controls"><div class="control-title">Transaction dates</div><strong>${esc(readablePeriod(state.txRange))}</strong><p class="notice">Opened from Buildings.</p><button data-action="clear-tx-week">Use recent date range</button></section>`;
            const value = `week:${state.periodCount}`;
            const custom = state.rangeCustom || !rangeChoices.some(([key]) => key === value);
            return `<section class="time-controls"><label>Time range<select data-filter="rangePreset" aria-label="Time range">${options(rangeChoices, custom ? 'custom' : value)}</select></label>${custom ? `<label>Number of weeks<input data-filter="periodCount" aria-label="Number of weeks" type="number" min="1" max="104" step="1" value="${state.periodCount}"></label>` : ''}<p class="notice">Includes the current, unfinished week.</p></section>`;
        }

        function renderViewControls() {
            if (!state.model) return '';
            if (state.view === 'week') {
                const period = selectedPeriod();
                return `<div class="sidebar-summary"><strong>${fmt(periodTotal(period))} tokens</strong><span>${fmt(periodTransactions(period).length)} donations · whole selection</span></div><button data-action="week-transactions">View period transactions</button>`;
            }
            if (state.view === 'members') {
                const count = chosenMembers().filter(name => state.joinDates[name]).length;
                return `<label>Weekly target<input aria-label="Weekly goal per member" data-filter="goal" type="number" min="1" max="1000000" step="1" value="${state.goal}"></label><p class="notice">Every started week requires the full target, including the joining week.</p><p class="notice">${count}/${chosenMembers().length} join dates set · ${guildSettingsKey ? 'Saved locally' : 'Session only'}</p>`;
            }
            if (state.view === 'activity') {
                const period = selectedActivityPeriod();
                const rows = activityRows();
                const available = rows.filter(r => r.stats.recordedDays > 0).length;
                return `<button class="${activityCovered() ? '' : 'primary'}" data-action="refresh-activity" ${state.activityLoading ? 'disabled' : ''}>${state.activityLoading ? 'Loading activity…' : activityCovered() ? 'Refresh activity' : 'Load this ' + period.unit}</button>${state.activityLoading ? '<button data-action="cancel-activity">Cancel activity load</button>' : ''}<p class="notice">${activityCovered() || available ? `${available} of ${rows.length} members have records` : 'No loaded activity for these dates.'}${state.publicActivity ? `<br>Updated ${esc(state.publicActivity.asOf.replace('T', ' ').slice(0, 16))} UTC` : ''}</p><input class="hidden" type="file" accept=".json,application/json" id="stat-file" multiple>`;
            }
            if (state.view === 'transactions') {
                const all = filteredTransactions();
                const pages = Math.max(1, Math.ceil(all.length / 100));
                state.txPage = Math.min(state.txPage, pages);
                return `<div class="transaction-footer"><button data-action="prev-tx" ${state.txPage <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${state.txPage} / ${pages}</span><button data-action="next-tx" ${state.txPage >= pages ? 'disabled' : ''}>Next</button></div><p class="notice">${fmt(all.length)} matching donations · 100 per page</p>`;
            }
            return '';
        }

        function renderViewHelp() {
            if (state.view === 'week') return '<p>Choose one Monday-reset week. Each building shows its eligible donated tokens, unique donors and donation count. Click a building to expand who donated and how much; click a member to filter this view.</p><p>Only donations on or after saved UTC join dates count. With no join date, recorded donations remain eligible. Member and building filters apply to both totals and donor details.</p><p>Previous/next moves one week; Current returns to this week. View period transactions opens the matching eligible donation records. All these controls work locally without new requests.</p>';
            if (state.view === 'activity') return `<p>Estimated active days count records whose tracked stats changed from the preceding recorded day—not confirmed logins. Equal snapshots can undercount activity; corrections or resets can also create changes. Missing records or comparisons stay unknown.</p><p>Recorded days are available StatVault entries. Level change uses the nearest real pre-period level and latest in-period level. * An earlier baseline may include gains before the period. Missing baselines show —; negative corrections are retained. Snapshot differences are not exact reset-time balances.</p><p>Filters are local. Refresh is manual. Public results contain levels and comparison flags, not raw XP, damage or raid totals.</p>`;
            if (state.view === 'members') return '<p>Join dates are UTC. Donations before joining never count toward goals. No date means unknown lifetime goal.</p><p>Every started Monday-reset week requires a full weekly target, including the joining week and current unfinished week. Goals are always whole multiples of the weekly target; completed-week shortfall excludes the current week.</p><p>The current weekly goal applies to all history. Surplus donations offset cumulative shortfalls, but weeks met checks each completed week separately.</p>';
            const usage = state.view === 'guild' ? 'Guild trend always shows every recorded week, including empty weeks, newest first. Scroll the table to view older weeks. The chart shows the same full history chronologically; CSV exports all weeks. Click a week to inspect its building totals.' : state.view === 'week' ? 'Choose one week to inspect. Arrows move one week; Current returns to the present. Click a building to reveal each donor and their token total. Your comparison range in Donations stays unchanged.' : state.view === 'transactions' ? 'Transactions use your recent comparison range unless opened from Buildings. Use recent date range clears that drilldown. Pages contain up to 100 donations; CSV includes all matching rows.' : 'Choose a recent time range, or Custom range for a different number of weeks. Click a date heading to inspect that week in Buildings. Newest weeks appear first.';
            return `<p>${usage} Click a member to filter this view; All members clears that filter.</p><p>Only recorded donors can be discovered; former members may appear. All rows remain available by scrolling, with pinned names, headings and totals.</p><p>Colors use post-join credits and weekly goals. No obligation means no color. Without a join date, colors use the full weekly goal.</p><p>Weeks reset Monday 00:00 UTC. Any membership in a week requires its full target, including a partial joining week. In progress means the week is unfinished, not that its goal is reduced.</p>`;
        }

        function render() {
            if (state.disposed) return;
            const sidebarScroll = shadow.querySelector('.sidebar-scroll')?.scrollTop || 0;
            const positions = renderedView === state.view ? new Map([...shadow.querySelectorAll('[data-scroll-key]')].map(el => [el.dataset.scrollKey, [el.scrollTop, el.scrollLeft]])) : new Map();
            const openHelp = new Set([...shadow.querySelectorAll('details[data-help][open]')].map(el => el.dataset.help));
            const active = shadow.activeElement;
            const focusKey = active && ['filter', 'view', 'action', 'joinMember', 'buildingDetail'].find(key => active.dataset[key] !== undefined);
            const focusValue = focusKey ? active.dataset[focusKey] : null;
            periodCache.clear();
            const ready = !!state.model;
            const periods = chosenPeriods();
            const total = periods.reduce((sum, p) => sum + periodTotal(p), 0);
            const buildings = [...new Set((state.snapshot?.transactions || []).map(r => r.buildingName).filter(Boolean))].sort();
            const views = [['matrix', 'Donations'], ['week', 'Buildings'], ['members', 'Member goals'], ['guild', 'Guild trend'], ['activity', 'Activity'], ['transactions', 'Transactions']];
            const viewTitle = views.find(([id]) => id === state.view)[1];
            const singlePeriod = ['week', 'activity'].includes(state.view) ? selectedPeriod() : state.view === 'transactions' ? state.txRange : null;
            const dates = state.view === 'members' ? 'Lifetime since joining · all buildings' : (singlePeriod ? readablePeriod(singlePeriod) : readableDateRange(periods.at(-1).start, periods[0].endExclusive)) + ' · UTC';
            const donationView = !['activity', 'members'].includes(state.view);
            const scope = state.member || `${chosenMembers().length} recorded donors`;
            const summary = ['matrix', 'guild'].includes(state.view) && ready ? ` · ${fmt(total)} tokens` : '';
            const error = state.error || (state.view === 'activity' ? state.activityError : '');
            const activityNotice = state.view === 'activity' ? 'Changed records estimate activity—not logins. * Earlier baseline; — unknown.' : '';
            const extraFilters = donationView && state.building ? 1 : 0;
            shadow.innerHTML = `<style>${CSS}</style><section class="app ${state.compactRows ? 'compact' : 'comfortable'}" role="dialog" aria-modal="false" aria-label="Guild Activity Monitor">
                <button class="dialog-close" data-action="close" aria-label="Close guild activity monitor" title="Close Guild Activity Monitor">✕</button>
                <aside class="sidebar" id="monitor-controls" aria-label="Guild monitor controls"><header class="sidebar-top"><div><div class="eyebrow">Dragons of the Void</div><h1>Guild Activity Monitor</h1><p class="muted small">${esc(guildContext.guildName)}</p></div></header>
                <div class="data-status"><div id="load-status" class="status${state.error ? ' error' : ''}" role="status" aria-live="polite" title="${state.snapshot ? esc('Loaded ' + state.snapshot.fetchedAt) : ''}">${statusText()}</div><button data-action="${state.loading ? 'cancel' : 'refresh'}">${state.loading ? 'Cancel' : state.snapshot ? 'Refresh' : 'Load'}</button></div>
                <div class="sidebar-scroll">
                <nav class="tabs" aria-label="Monitor views">${views.map(([id, title]) => `<button id="monitor-tab-${id}" aria-controls="monitor-visuals" ${state.view === id ? 'aria-current="page"' : ''} data-view="${id}">${title}</button>`).join('')}</nav>
                <div class="filters"><label>Member<select data-filter="member" aria-label="Member">${options([['', 'All recorded members'], ...(state.model?.members || []).map(m => [m, m])], state.member)}</select></label></div>
                ${renderTimeControls()}
                <div class="view-controls">${renderViewControls()}</div>
                ${state.view === 'matrix' ? '<div class="legend"><span><i class="dot red"></i>Zero</span><span><i class="dot"></i>Below target</span><span>N/A · before joining</span></div>' : ''}${['matrix', 'guild'].includes(state.view) ? `<p class="notice">Weekly target: ${fmt(state.goal)} · <button class="link" data-view="members">Edit goals</button></p>` : ''}
                <details class="options-block" data-help="options"><summary>Display &amp; filters${extraFilters ? ` · ${extraFilters} active` : ''}</summary><div class="options-body"><label><input type="checkbox" data-filter="compactRows" aria-label="Compact rows" ${state.compactRows ? 'checked' : ''}>Compact rows</label>
                ${donationView ? `<label>Building<select data-filter="building" aria-label="Building">${options([['', 'All buildings'], ...buildings.map(b => [b, b])], state.building)}</select></label>` : ''}
                ${state.view === 'members' ? `<label><input type="checkbox" data-filter="goalDetails" ${state.goalDetails ? 'checked' : ''}>Show completed-week details</label>` : ''}
                ${state.view === 'activity' ? `<label><input type="checkbox" data-filter="activityDetails" ${state.activityDetails ? 'checked' : ''}>Show sources and baselines</label>` : ''}</div></details>
                <details class="export-block" data-help="exports"><summary>Export${state.view === 'activity' ? ' / import activity' : ''}</summary><div class="actions"><button data-action="csv" ${ready ? '' : 'disabled'}>This view · CSV</button>${state.view === 'matrix' ? `<button data-action="png" ${ready ? '' : 'disabled'}>Matrix image</button>` : ''}${state.view === 'activity' ? '<button data-action="export-stats">Activity JSON</button><button data-action="import-stats">Import stats</button>' : `<button class="quiet" data-action="json" ${ready ? '' : 'disabled'}>Eligible history JSON</button>`}</div></details>
                <details class="help-block" data-help="${state.view}"><summary>How this view works</summary>${renderViewHelp()}</details>
                <footer class="footer"><span class="small muted">v${VERSION} · Read-only</span></footer></div></aside>
                <main class="content" id="monitor-visuals" aria-labelledby="workspace-title"><header class="workspace-heading"><div><h2 id="workspace-title" tabindex="-1">${viewTitle}${singlePeriod?.isCurrent ? ' <span class="partial">In progress</span>' : ''}</h2><p>${state.view === 'guild' ? 'All ' + periods.length + ' weeks · ' : ''}${esc(dates)} · ${esc(scope)}${donationView && state.building ? ' · ' + esc(state.building) : ''}${summary}</p></div>${state.member ? '<button class="scope-reset" data-action="clear-member">All members</button>' : donationView && state.building ? '<button class="scope-reset" data-action="clear-building">All buildings</button>' : ''}</header>
                ${error ? `<div class="workspace-message status error" role="alert">${esc(error)}</div>` : state.message ? `<div class="workspace-message notice" role="status">${esc(state.message)}</div>` : activityNotice ? `<div class="workspace-message notice">${activityNotice}</div>` : ''}
                <div class="view-body">${ready ? ({ matrix: renderMatrix, week: renderWeek, members: renderMembers, guild: renderGuild, activity: renderActivity, transactions: renderTransactions }[state.view]()) : `<div class="empty"><h2>${state.loading ? 'Loading the complete donation history…' : 'No verified history yet'}</h2><p>${state.loading ? 'Period totals appear after all pages pass verification.' : 'Use Load to start or retry.'}</p></div>`}</div></main></section>`;
            for (const el of shadow.querySelectorAll('details[data-help]')) el.open = openHelp.has(el.dataset.help);
            if (focusKey) {
                const target = [...shadow.querySelectorAll('button,input,select')].find(el => el.dataset[focusKey] === focusValue);
                if (target?.getClientRects().length && getComputedStyle(target).visibility !== 'hidden') target.focus({ preventScroll: true });
            }
            shadow.querySelector('.sidebar-scroll').scrollTop = sidebarScroll;
            for (const el of shadow.querySelectorAll('[data-scroll-key]')) {
                const position = positions.get(el.dataset.scrollKey);
                if (position) { el.scrollTop = position[0]; el.scrollLeft = position[1]; }
            }
            renderedView = state.view;
        }

        async function refresh() {
            state.controller?.abort();
            const run = ++state.run;
            const currentToken = token();
            if (currentToken !== state.token) { clearActivityAccount(); state.snapshot = null; state.model = null; state.member = ''; state.building = ''; }
            state.token = currentToken;
            state.error = ''; state.message = ''; state.progress = null;
            if (!currentToken) { state.error = 'No login token found. Sign in and reopen Guild Activity Monitor.'; state.loading = false; render(); return; }
            state.controller = new AbortController();
            state.loading = true;
            render();
            try {
                const snapshot = await fetchAllDonations({
                    requestPage: args => requestDonationPage(args, currentToken),
                    signal: state.controller.signal,
                    onProgress: p => { if (run === state.run && !state.disposed) { state.progress = p; updateStatus(); } }
                });
                if (state.disposed || run !== state.run) return;
                state.snapshot = snapshot;
                recalc();
                recordCheckpoint();
            } catch (error) {
                if (state.disposed || run !== state.run) return;
                state.error = error.name === 'AbortError' ? 'Loading cancelled. No incomplete data was added.' : error.message;
            } finally {
                if (!state.disposed && run === state.run) { state.loading = false; render(); }
            }
        }

        function download(content, type, name) {
            const url = URL.createObjectURL(new Blob([content], { type }));
            const link = document.createElement('a');
            link.href = url; link.download = name; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        }

        function exportCsv() {
            let matrix;
            if (state.view === 'transactions') matrix = [['Transaction ID', 'Timestamp UTC', 'Week start UTC', 'Member', 'Building', 'Donated tokens'], ...filteredTransactions().map(r => [r.transactionId, r.timestamp, weekStartUtc(r.timestamp), r.characterName, r.buildingName, r.donatedTokenQty])];
            else if (state.view === 'members') matrix = [['Member', 'Join date UTC', 'Weekly goal per member', 'Joining week policy', 'Donated since join', 'Total goal through current week', 'Still needed', 'Completed weeks goal', 'Completed weeks shortfall', 'Current week goal', 'Completed weeks met', 'Completed eligible weeks', 'Zero completed weeks', 'Last donation UTC'], ...memberSummary().map(r => [r.name, r.joinDate, state.goal, state.joinWeekPolicy, r.eligibleTokens, r.totalGoal, r.remaining, r.completedGoal, r.completedShortfall, r.currentGoal, r.weeksMet, r.completedWeeks, r.zeroWeeks, r.last])];
            else if (state.view === 'activity') matrix = [['Period start UTC', 'Period end exclusive UTC', 'Member', 'Estimated active days (not logins)', 'Comparable days', 'Recorded days', 'Elapsed calendar days', 'Observed level change', 'Latest recorded level', 'Baseline day', 'Baseline is preceding day', 'Latest day', 'Source / status'], ...activityRows().map(r => [selectedActivityPeriod().start, selectedActivityPeriod().endExclusive, r.name, r.stats.changedDays, r.stats.comparableDays, r.stats.recordedDays, r.stats.expectedDays, r.stats.levelGain, r.stats.latestLevel, r.stats.baselineDate, r.stats.baselineExact, r.stats.lastDate, r.source])];
            else if (state.view === 'week') {
                const period = selectedPeriod();
                const buildings = new Map();
                for (const row of periodTransactions(period)) {
                    const name = row.buildingName || 'Unknown building';
                    const data = buildings.get(name) || { tokens: 0, donations: 0, donors: new Set() };
                    data.tokens += row.donatedTokenQty; data.donations++; data.donors.add(row.characterName);
                    buildings.set(name, data);
                }
                matrix = [['Week start UTC', 'End exclusive UTC', 'Status', 'Building', 'Donated tokens', 'Donors', 'Donations'], ...[...buildings].sort((a, b) => b[1].tokens - a[1].tokens || a[0].localeCompare(b[0])).map(([name, data]) => [period.start, period.endExclusive, period.isCurrent ? 'Partial' : 'Complete', name, data.tokens, data.donors.size, data.donations])];
            }
            else if (state.view === 'guild') matrix = [['Period start UTC', 'End exclusive UTC', 'Status', state.member || 'Guild total'], ...chosenPeriods().map(p => [p.start, p.endExclusive, p.isCurrent ? 'Partial' : 'Complete', periodTotal(p)])];
            else matrix = matrixData();
            download('\uFEFF' + csvEncode(matrix), 'text/csv;charset=utf-8', `dotv-donations-${state.view}-${new Date().toISOString().slice(0, 10)}.csv`);
        }

        async function exportPng() {
            const matrix = matrixData();
            const periods = chosenPeriods();
            const memberWidth = Math.max(180, ...chosenMembers().map(name => name.length * 8 + 24));
            const colWidths = matrix[0].map((h, i) => i === 0 ? Math.min(300, memberWidth) : i === matrix[0].length - 1 ? 110 : Math.max(126, String(h).length * 7 + 24));
            const width = colWidths.reduce((s, n) => s + n, 0) + 32;
            const tableTop = 124;
            const height = tableTop + matrix.length * 29 + 36;
            const scale = 2;
            if (width * scale > 16000 || height * scale > 16000 || width * height * scale * scale > 65000000) throw new Error('This matrix is too large for one PNG. Select a shorter history range or a member.');
            const canvas = document.createElement('canvas');
            canvas.width = width * scale; canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('PNG export is unavailable in this browser.');
            ctx.scale(scale, scale);
            ctx.fillStyle = '#0c1423'; ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#efd39a'; ctx.font = 'bold 24px system-ui'; ctx.fillText('Weekly Donated Tokens' + (state.member ? ' · ' + state.member : ' · Full guild'), 20, 35, width - 40);
            ctx.fillStyle = '#bdc9dc'; ctx.font = '12px system-ui'; ctx.fillText(`${periods.length} weeks · Weekly goal ${fmt(state.goal)} · Join week: ${state.joinWeekPolicy} · ${state.building || 'All buildings'}`, 20, 58, width - 40);
            ctx.fillText('Monday 00:00 UTC boundaries · Every started membership week requires the full target.', 20, 78, width - 40);
            ctx.fillText(`Loaded ${state.snapshot.fetchedAt.replace('T', ' ').slice(0, 19)} UTC · Current week is partial`, 20, 98, width - 40);
            for (let r = 0; r < matrix.length; r++) {
                let x = 16;
                for (let c = 0; c < matrix[r].length; c++) {
                    const val = matrix[r][c];
                    const summary = r === 0 || r === matrix.length - 1;
                    const colored = !summary && val !== 'N/A' && c >= 1 && c < matrix[r].length - 1;
                    const goal = colored ? periodGoal(periods[c - 1], matrix[r][0]) : 0;
                    const credited = colored ? periodCredited(periods[c - 1], matrix[r][0]) : 0;
                    const zero = colored && goal > 0 && credited === 0;
                    const low = colored && goal > 0 && credited < goal;
                    ctx.fillStyle = summary ? '#243447' : zero ? '#f5c4c5' : low ? '#f9e5a0' : r % 2 ? '#f1f5fa' : '#dce6f2';
                    ctx.fillRect(x, tableTop + r * 29, colWidths[c], 28);
                    ctx.fillStyle = summary ? '#f2d59c' : zero ? '#881d29' : low ? '#694b08' : '#17263d';
                    ctx.font = (summary ? 'bold ' : '') + '12px system-ui';
                    ctx.textAlign = c === 0 || r === 0 ? 'left' : 'right';
                    ctx.fillText(typeof val === 'number' ? fmt(val) : String(val), x + (ctx.textAlign === 'right' ? colWidths[c] - 10 : 10), tableTop + 19 + r * 29, colWidths[c] - 18);
                    x += colWidths[c];
                }
            }
            ctx.textAlign = 'left'; ctx.fillStyle = '#a6b6cd'; ctx.font = '11px system-ui'; ctx.fillText('Red: zero. Yellow: below goal. N/A: before joining, excluded. Only eligible donations count.', 20, height - 14, width - 40);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('PNG creation failed. Try a shorter range.');
            download(blob, 'image/png', `dotv-weekly-matrix-${new Date().toISOString().slice(0, 10)}.png`);
        }

        shadow.addEventListener('change', async event => {
            if (event.target.dataset.joinMember !== undefined) {
                const input = event.target;
                const name = input.dataset.joinMember;
                if (!input.checkValidity()) { input.reportValidity(); return; }
                try {
                    const date = input.value;
                    if (date) {
                        joinDateMs(date);
                        if (date < '2000-01-01' || date > new Date().toISOString().slice(0, 10)) throw new Error('Join date must be between 2000-01-01 and today (UTC).');
                        state.joinDates[name] = date;
                    } else delete state.joinDates[name];
                    state.error = ''; saveSettings(); recalc(); render();
                    [...shadow.querySelectorAll('[data-join-member]')].find(el => el.dataset.joinMember === name)?.focus();
                } catch (error) { state.error = error.message; updateStatus(); }
                return;
            }
            if (event.target.id === 'stat-file') {
                try {
                    const values = [];
                    for (const file of event.target.files) {
                        if (file.size > 5000000) throw new Error('Each StatVault JSON file must be under 5 MB.');
                        const parsed = JSON.parse(await file.text());
                        values.push(...(Array.isArray(parsed.histories) ? parsed.histories : [parsed]));
                    }
                    const validated = values.map(normalizeStatImport);
                    for (const value of validated) saveStatsSnapshot(value, 'JSON import');
                    state.message = `Imported ${validated.length} local character histories.`; state.error = ''; render();
                } catch (error) { state.error = error.message; render(); }
                return;
            }
            const field = event.target.dataset.filter;
            if (!['member', 'building', 'goal', 'periodCount', 'rangePreset', 'focusStart', 'compactRows', 'goalDetails', 'activityDetails'].includes(field)) return;
            if (['compactRows', 'goalDetails', 'activityDetails'].includes(field)) {
                state[field] = event.target.checked;
                render();
                shadow.querySelector(`[data-filter="${field}"]`)?.focus({ preventScroll: true });
                return;
            }
            let value = event.target.value;
            if (field === 'rangePreset') {
                if (!rangeChoices.some(([key]) => key === value)) return;
                state.rangeCustom = value === 'custom';
                if (!state.rangeCustom) {
                    state.periodCount = Number(value.split(':')[1]);
                }
                state.txRange = null; state.txPage = 1; state.message = '';
                render();
                shadow.querySelector('[data-filter="rangePreset"]')?.focus({ preventScroll: true });
                return;
            }
            if (field === 'focusStart') {
                if (!focusPeriods().some(p => p.start === value)) return;
                setFocusedPeriod(focusedPeriod({ start: value }));
                state.activityError = ''; state.message = '';
                render();
                shadow.querySelector('[data-filter="focusStart"]')?.focus({ preventScroll: true });
                return;
            }
            if (field === 'goal') {
                if (!event.target.checkValidity()) { event.target.reportValidity(); return; }
                value = Number(value);
                if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) return;
            }
            if (field === 'periodCount') {
                if (!event.target.checkValidity()) { event.target.reportValidity(); return; }
                value = Number(value);
                if (!Number.isInteger(value) || value < 1 || value > 104) return;
            }
            state[field] = value;
            state.message = '';
            if (field === 'goal') { state.error = ''; saveSettings(); }
            state.txPage = 1;
            if (field === 'periodCount') { state.rangeCustom = true; state.txRange = null; }
            if (field === 'building' && state.snapshot) recalc();
            render();
            shadow.querySelector(`[data-filter="${field}"]`)?.focus({ preventScroll: true });
        });

        shadow.addEventListener('click', async event => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            try {
                if (button.dataset.buildingDetail !== undefined) {
                    state.expandedBuilding = state.expandedBuilding === button.dataset.buildingDetail ? null : button.dataset.buildingDetail;
                    render(); return;
                }
                if (button.dataset.member !== undefined) { state.member = button.dataset.member; state.txPage = 1; state.message = ''; render(); focusWorkspace(); return; }
                if (button.dataset.period) {
                    const period = chosenPeriods().find(p => p.start === button.dataset.period);
                    if (!period) return;
                    setFocusedPeriod(period); state.view = 'week'; state.expandedBuilding = null; state.message = ''; render(); focusWorkspace(); return;
                }
                if (button.dataset.view) { state.view = button.dataset.view; state.message = ''; render(); focusWorkspace(); if (state.view === 'activity' && !state.publicActivity) await loadActivity(); return; }
                switch (button.dataset.action) {
                    case 'clear-member': state.member = ''; state.txPage = 1; render(); focusWorkspace(); break;
                    case 'clear-building': state.building = ''; state.txPage = 1; recalc(); render(); focusWorkspace(); break;
                    case 'previous-period':
                    case 'next-period':
                        setFocusedPeriod(moveFocusedPeriod({ start: selectedPeriod().start, direction: button.dataset.action === 'previous-period' ? 'previous' : 'next' }));
                        state.activityError = ''; state.message = ''; render();
                        shadow.querySelector('[data-filter="focusStart"]')?.focus({ preventScroll: true });
                        break;
                    case 'current-period':
                        setFocusedPeriod(focusedPeriod()); state.activityError = ''; state.message = ''; render();
                        shadow.querySelector('[data-filter="focusStart"]')?.focus({ preventScroll: true });
                        break;
                    case 'refresh': await refresh(); break;
                    case 'cancel': state.controller?.abort(); break;
                    case 'refresh-activity': await loadActivity(); break;
                    case 'cancel-activity': state.activityController?.abort(); break;
                    case 'close': close(); break;
                    case 'csv': exportCsv(); break;
                    case 'png': await exportPng(); break;
                    case 'import-stats': shadow.getElementById('stat-file')?.click(); break;
                    case 'export-stats': download(JSON.stringify({ exportType: 'dotv-guild-activity-local', exportedAt: new Date().toISOString(), guild: guildContext, donationGoalSettings: { goal: state.goal, joinWeekPolicy: state.joinWeekPolicy, joinDates: state.joinDates }, publicActivity: state.publicActivity, histories: localHistories.filter(h => chosenMembers().includes(h.characterName)) }, null, 2), 'application/json', 'dotv-guild-activity-local.json'); break;
                    case 'json': {
                        const transactions = state.snapshot.transactions.filter(row => eligibleDonation(row) && parseUtc(row.timestamp) <= Date.now());
                        download(JSON.stringify({ exportType: 'dotv-guild-eligible-transactions', exportedAt: new Date().toISOString(), sourceFetchedAt: state.snapshot.fetchedAt, transactionType: 1, transactionCount: transactions.length, joinDates: state.joinDates, eligibility: 'On or after saved UTC join dates; unknown join dates retain recorded history.', transactions }), 'application/json', 'dotv-eligible-donation-history.json');
                        break;
                    }
                    case 'week-transactions': state.txRange = { ...selectedPeriod() }; state.txPage = 1; state.view = 'transactions'; render(); focusWorkspace(); break;
                    case 'clear-tx-week': state.txRange = null; state.txPage = 1; render(); focusWorkspace(); break;
                    case 'prev-tx':
                    case 'next-tx': {
                        state.txPage += button.dataset.action === 'prev-tx' ? -1 : 1;
                        render();
                        const table = shadow.querySelector('[data-scroll-key="transactions"]');
                        if (table) table.scrollTop = 0;
                        const nextFocus = shadow.querySelector(`[data-action="${button.dataset.action}"]:not(:disabled)`);
                        if (nextFocus) nextFocus.focus({ preventScroll: true }); else focusWorkspace();
                        break;
                    }
                }
            } catch (error) { state.error = error.message; render(); }
        });

        // Keep game keyboard shortcuts from acting while a ledger control has focus.
        for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, event => event.stopPropagation());
        shadow.addEventListener('keydown', event => {
            // Leave Tab navigation native so the nonmodal header launcher stays reachable.
            if (event.key === 'Escape') { event.preventDefault(); close(); }
        });
        const lifecycle = setInterval(() => {
            if (!guildRoot.isConnected) { dispose(); return; }
            const currentGuild = readGuildContext(guildRoot);
            if (guildContext.guildId && currentGuild.guildId && guildContext.guildId !== currentGuild.guildId) { dispose(); return; }
            if (token() !== state.token) {
                clearActivityAccount();
                state.controller?.abort(); state.run++; state.loading = false; state.token = token(); state.snapshot = null; state.model = null;
                state.error = 'Account changed. Reopen Guild Activity Monitor or load history again.'; render();
            }
            if (state.snapshot && !state.loading && state.model.currentWeek !== weekStartUtc(new Date().toISOString())) { recalc(); render(); }
        }, 500);
        refresh();
        shadow.querySelector('[data-action="close"]')?.focus();
        return {
            dispose, setBounds(top, height) {
                host.style.setProperty('--monitor-top', Math.round(top) + 'px');
                host.style.setProperty('--monitor-height', Math.round(height) + 'px');
            }
        };
    }

    function install() {
        if (typeof document === 'undefined' || window.__dotvGuildActivityMonitorInstalled) return;
        window.__dotvGuildActivityMonitorInstalled = true;
        observeStatVault();
        let active = null;
        let queued = false;
        let launcher = null;
        const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(queue) : null;

        function removeLauncher() {
            if (!launcher) return;
            resizeObserver?.unobserve(launcher.root);
            resizeObserver?.unobserve(launcher.header);
            resizeObserver?.unobserve(launcher.name);
            resizeObserver?.unobserve(launcher.row);
            launcher.row.remove();
            launcher = null;
        }

        function positionLauncher() {
            if (!launcher) return;
            const { root, header, name, row, button, context } = launcher;
            const bounds = root.getBoundingClientRect();
            const headerBounds = header.getBoundingClientRect();
            const nameBounds = name.getBoundingClientRect();
            const viewportWidth = document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight;
            button.setAttribute('aria-expanded', String(!!active));
            button.title = active ? 'Close Guild Activity Monitor' : 'Open Guild Activity Monitor';
            if (!root.isConnected || !name.isConnected || (!active && (!root.getClientRects().length || bounds.width <= 0 || bounds.height <= 0 || bounds.bottom <= 0 || bounds.top >= viewportHeight || bounds.right <= 0 || bounds.left >= viewportWidth))) {
                row.hidden = true;
                row.style.display = 'none';
                return;
            }
            row.hidden = false;
            // Normally occupy a single existing toolbar slot directly after the
            // guild name. If that header leaves the viewport, keep the same
            // control reachable in a small pinned guild-name rail instead.
            const pinned = !!active && (!name.getClientRects().length || headerBounds.top < 0 || headerBounds.bottom > viewportHeight - 180 || nameBounds.right <= 0 || nameBounds.left >= viewportWidth);
            if (pinned) {
                if (row.parentElement !== document.body) document.body.append(row);
                row.style.cssText = 'position:fixed;z-index:2147483001;top:8px;left:12px;display:inline-flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:5px 8px;border:1px solid #59647a;border-radius:7px;background:#111c2d;box-shadow:0 3px 14px #0008;';
                const guildName = name.textContent?.trim() || 'Guild';
                if (context.textContent !== guildName) context.textContent = guildName;
                context.hidden = false;
            } else {
                if (row.parentElement !== name.parentElement || row.previousElementSibling !== name) name.after(row);
                row.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;margin:0;padding:0;line-height:1;max-width:100%;';
                context.hidden = true;
            }
            if (active) {
                const top = Math.max(6, (pinned ? row.getBoundingClientRect().bottom : header.getBoundingClientRect().bottom) + 8);
                active.setBounds(top, Math.max(80, viewportHeight - top - 12));
            }
        }

        function check() {
            queued = false;
            const guildRoot = document.getElementById('guild-map-screen');
            const header = guildRoot?.querySelector('.guild-header');
            const name = header?.querySelector('.guild-name');
            if (launcher && (launcher.root !== guildRoot || launcher.header !== header || launcher.name !== name || !launcher.row.isConnected)) {
                const oldRoot = launcher.root;
                removeLauncher();
                if (oldRoot !== guildRoot) active?.dispose();
            }
            if (!guildRoot || !header || !name) return;
            if (launcher) { positionLauncher(); return; }
            const row = document.createElement('div');
            row.dataset.dotvGuildMonitor = '';
            const context = document.createElement('span');
            context.hidden = true;
            context.style.cssText = 'font:600 12px/1.3 system-ui;color:#efcf93;max-width:45vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Guild Activity Monitor';
            button.setAttribute('aria-label', 'Guild Activity Monitor');
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', 'dotv-guild-activity-monitor');
            button.style.cssText = 'font:600 12px/1.3 system-ui;padding:6px 10px;border:1px solid #8f794d;border-radius:5px;background:linear-gradient(#263447,#162132);color:#efcf93;cursor:pointer;box-shadow:0 2px 7px #0006;white-space:nowrap;max-width:100%;';
            button.addEventListener('click', () => {
                if (active) { active.dispose(); return; }
                if (!active && guildRoot.isConnected) {
                    active = createController(guildRoot, () => {
                        active = null;
                        positionLauncher();
                        if (launcher?.button.isConnected && !launcher.row.hidden) launcher.button.focus({ preventScroll: true });
                        queue();
                    });
                    positionLauncher();
                }
            });
            for (const type of ['keydown', 'keyup', 'keypress']) button.addEventListener(type, event => event.stopPropagation());
            row.append(context, button);
            name.after(row);
            launcher = { root: guildRoot, header, name, row, button, context };
            resizeObserver?.observe(guildRoot);
            resizeObserver?.observe(header);
            resizeObserver?.observe(name);
            resizeObserver?.observe(row);
            positionLauncher();
        }
        function queue() { if (!queued) { queued = true; requestAnimationFrame(check); } }
        const watch = () => { new MutationObserver(queue).observe(document.body, { childList: true, subtree: true }); check(); };
        if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch, { once: true });
        window.addEventListener('resize', queue, { passive: true });
        document.addEventListener('scroll', queue, { passive: true, capture: true });
        window.visualViewport?.addEventListener('resize', queue, { passive: true });
        window.visualViewport?.addEventListener('scroll', queue, { passive: true });
        window.addEventListener('hashchange', () => { active?.dispose(); queue(); });
    }

    return { VERSION, weekStartUtc, aggregateDonations, membershipGoalForWeek, membershipGoalForPeriod, buildPeriods, readableDateRange, readablePeriod, focusedPeriod, moveFocusedPeriod, summarizeDonationPeriod, buildDonationMatrix, summarizeMemberGoals, normalizeGuildSettings, fetchAllDonations, csvEncode, requestDonationPage, normalizeStatImport, summarizeStatWeek, mergeStatDays, validateActivityQuery, normalizeActivitySummary, summarizeActivityPeriod, localActivityDays, requestActivitySummary, install };
});
