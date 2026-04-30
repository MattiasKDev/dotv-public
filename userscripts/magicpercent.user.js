// ==UserScript==
// @name         Magic Percent
// @namespace    https://github.com/MattiasKDev
// @author       infinity
// @description  Add magic proc percentages to raid battle logs
// @version      2026.04.30
// @match        https://play.dragonsofthevoid.com/*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    "use strict";

    const SCRIPT_NAME = "magic-percent";
    const LOG_PREFIX = `[${SCRIPT_NAME}]`;
    const ATTACK_PATH = "/api/raid/attack";
    const PLAYER_DAMAGE_REDUCTION_TYPE = "damagetoplayerreductionpercent";
    const PENDING_HIT_TTL_MS = 8000;
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const pendingHits = [];
    let applyPendingHitsTimer = null;

    console.log(`${LOG_PREFIX} loaded`);

    function isAttackUrl(url) {
        return new URL(url, location.origin).pathname === ATTACK_PATH;
    }

    function formatItemName(itemId) {
        return itemId.replace(/^m\./, "")
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }

    function formatAmount(amount) {
        return amount.toLocaleString("en-US");
    }

    function normalizeMatchText(text) {
        return text.replace(/['\u2019]/g, "");
    }

    function handleAttackResponse(data) {
        const mods = data.damage.mods;
        const damageMods = mods.filter((mod) => mod.type === "damage");
        const baseDamage = damageMods.reduce((total, mod) => total - mod.amount, data.damage.totalDamage);
        const magicProcs = damageMods
            .filter((mod) => mod.itemId.startsWith("m."))
            .map((mod) => ({
                type: "damage",
                itemId: mod.itemId,
                name: formatItemName(mod.itemId),
                amount: mod.amount,
                amountText: formatAmount(mod.amount),
                percentText: ((mod.amount / baseDamage) * 100).toFixed(2),
            }))
            .concat(mods
                .filter((mod) => mod.type === PLAYER_DAMAGE_REDUCTION_TYPE && mod.itemId.startsWith("m."))
                .map((mod) => ({
                    type: "playerDamageReduction",
                    itemId: mod.itemId,
                    name: formatItemName(mod.itemId),
                    amount: mod.amount,
                    percentText: (mod.amount * 100).toFixed(2),
                })));

        if (!magicProcs.length) return;

        pendingHits.push({
            totalDamageText: formatAmount(data.damage.totalDamage),
            magicProcs,
            createdAt: Date.now(),
        });

        scheduleApplyPendingHits();
        setTimeout(applyPendingHitsSafely, 50);
        setTimeout(applyPendingHitsSafely, 250);
        setTimeout(applyPendingHitsSafely, 1000);
        setTimeout(applyPendingHitsSafely, PENDING_HIT_TTL_MS + 100);
    }

    function isHitStartLine(entry, hit) {
        if (hit) {
            return entry.textContent.includes(`did ${hit.totalDamageText} damage`)
                || entry.textContent.includes(`crit ${hit.totalDamageText} damage`)
                || entry.textContent.includes(`CRIT ${hit.totalDamageText}`);
        }

        return /\b(?:did|crit) [\d,]+ damage\b/.test(entry.textContent)
            || /\bCRIT [\d,]+\b/.test(entry.textContent);
    }

    function getDirectHitRows(startEntry) {
        const rows = [];
        let entry = startEntry.nextElementSibling;

        while (entry && !isHitStartLine(entry)) {
            rows.push(entry);
            entry = entry.nextElementSibling;
        }

        return rows;
    }

    function getHitGroups(container, hit) {
        const groups = [];

        for (const startEntry of container.querySelectorAll(":scope > div")) {
            if (!isHitStartLine(startEntry, hit)) continue;

            const details = startEntry.nextElementSibling?.matches("details.log-group")
                ? startEntry.nextElementSibling
                : null;

            groups.push({
                markers: details ? [startEntry, details] : [startEntry],
                rows: details ? [...details.querySelectorAll(":scope > div")] : getDirectHitRows(startEntry),
            });
        }

        for (const details of container.querySelectorAll(":scope > details")) {
            const summary = details.querySelector(":scope > summary");
            if (!summary || !isHitStartLine(summary, hit)) continue;

            groups.push({
                markers: [details],
                rows: [...details.querySelectorAll(":scope > div")],
            });
        }

        return groups;
    }

    function isMagicLineMatch(entry, magicProc) {
        if (entry.dataset.magicDataExposerLine) return false;

        const text = normalizeMatchText(entry.textContent.replace(/\s+/g, " ").trim());
        const magicName = normalizeMatchText(magicProc.name);
        if (magicProc.type === "playerDamageReduction") {
            return text.includes(magicName)
                && (text.includes("reduced the damage you took") || text.includes("damage mitigated"));
        }

        const expectedText = `${magicName} contributed ${magicProc.amountText} damage`;
        return text.includes(expectedText)
            || (text.includes(magicName) && text.includes(magicProc.amountText) && text.includes("damage"));
    }

    function createPercentSpan(percentText) {
        const percentSpan = document.createElement("span");
        percentSpan.textContent = ` (${percentText}%)`;
        percentSpan.style.color = "#ffd166";
        percentSpan.style.fontWeight = "600";
        return percentSpan;
    }

    function getProcDebugInfo(proc) {
        return {
            itemId: proc.itemId,
            name: proc.name,
            type: proc.type,
            amount: proc.amount,
            percent: `${proc.percentText}%`,
        };
    }

    function annotateMagicLine(entry, magicProc) {
        if (magicProc.type === "playerDamageReduction") {
            entry.appendChild(createPercentSpan(magicProc.percentText));
            entry.dataset.magicDataExposerLine = "true";
            return true;
        }

        const spans = [...entry.querySelectorAll("span")];
        const amountSpan = spans.find((span) => span.textContent.trim() === magicProc.amountText);

        if (amountSpan) {
            amountSpan.after(createPercentSpan(magicProc.percentText));
            entry.dataset.magicDataExposerLine = "true";
            return true;
        }

        const damageSpan = spans.find((span) => span.textContent.includes(`${magicProc.amountText} damage`)) || entry;
        const [beforeAmount, afterAmount] = damageSpan.textContent.split(magicProc.amountText);
        damageSpan.textContent = beforeAmount + magicProc.amountText;
        damageSpan.appendChild(createPercentSpan(magicProc.percentText));
        damageSpan.appendChild(document.createTextNode(afterAmount));
        entry.dataset.magicDataExposerLine = "true";
        return true;
    }

    function applyHitGroup(group, hit) {
        const matchedLines = [];

        for (const magicProc of hit.magicProcs) {
            const matchingRow = group.rows.find((entry) => !matchedLines.some((match) => match.entry === entry)
                && isMagicLineMatch(entry, magicProc));
            if (!matchingRow) continue;

            matchedLines.push({ entry: matchingRow, magicProc });
        }

        matchedLines.forEach((match) => {
            annotateMagicLine(match.entry, match.magicProc);
            match.magicProc.seen = true;
        });
        return matchedLines.length > 0;
    }

    function applyHit(container, hit) {
        return getHitGroups(container, hit).some((group) => applyHitGroup(group, hit));
    }

    function applyPendingHits() {
        const containers = document.querySelectorAll(".battle-log-container");
        const now = Date.now();

        for (let i = 0; i < pendingHits.length; i++) {
            const hit = pendingHits[i];

            try {
                [...containers].some((container) => applyHit(container, hit));
            } catch (error) {
                console.warn(`${LOG_PREFIX} failed to annotate a pending hit`, error);
            }

            if (now - hit.createdAt > PENDING_HIT_TTL_MS) {
                const unmatchedProcs = hit.magicProcs.filter((proc) => !proc.seen);
                if (unmatchedProcs.length) {
                    console.warn(`${LOG_PREFIX} dropped unmatched proc(s)`, {
                        totalDamage: hit.totalDamageText,
                        ageMs: now - hit.createdAt,
                        procs: unmatchedProcs.map(getProcDebugInfo),
                    });
                }

                pendingHits.splice(i, 1);
                i--;
            }
        }
    }

    function applyPendingHitsSafely() {
        try {
            applyPendingHits();
        } catch (error) {
            console.warn(`${LOG_PREFIX} failed to annotate battle log`, error);
        }
    }

    function scheduleApplyPendingHits() {
        if (applyPendingHitsTimer) return;

        applyPendingHitsTimer = setTimeout(() => {
            applyPendingHitsTimer = null;
            applyPendingHitsSafely();
        }, 25);
    }

    function observeBattleLog() {
        if (!document.body) {
            document.addEventListener("DOMContentLoaded", observeBattleLog, { once: true });
            return;
        }

        new MutationObserver(scheduleApplyPendingHits).observe(document.body, {
            childList: true,
            subtree: true,
        });

        scheduleApplyPendingHits();
    }

    const XHR = pageWindow.XMLHttpRequest || XMLHttpRequest;
    const realOpen = XHR.prototype.open;
    const realSend = XHR.prototype.send;

    XHR.prototype.open = function (_method, url) {
        this.__magicDataExposerUrl = url;
        return realOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
        this.addEventListener("load", () => {
            try {
                if (isAttackUrl(this.__magicDataExposerUrl)) {
                    handleAttackResponse(JSON.parse(this.responseText));
                }
            } catch (_e) {
                // Keep the page request untouched if parsing fails.
            }
        });

        return realSend.apply(this, arguments);
    };

    observeBattleLog();
})();
