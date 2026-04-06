"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const ANSI = {
    Reset: "\x1b[0m",
    Bright: "\x1b[1m",
    Dim: "\x1b[2m"
};

const FPS = 5;
const INTERVAL = 1000 / FPS;

const EXPAND_TIME = 2000;
const HOLD_TIME = 1000;
const FADE_OUT_TIME = 2000;
const SWITCH_INTERVAL = EXPAND_TIME + HOLD_TIME + FADE_OUT_TIME;

const CENTERS = {
    sun:  { x: 9,   y: 2.5 },
    moon: { x: 8,   y: 2.5 }
};

const THEMES = {
    amber_glow: {
        border: "\x1b[38;2;237;183;120m",
        title: "\x1b[38;2;255;150;88m",
        command: "\x1b[38;2;246;204;150m",
        success: "\x1b[38;2;198;211;132m",
        warning: "\x1b[38;2;245;189;118m",
        muted: "\x1b[38;2;173;150;128m"
    },
    moss_breeze: {
        border: "\x1b[38;2;155;203;164m",
        title: "\x1b[38;2;97;169;128m",
        command: "\x1b[38;2;193;226;197m",
        success: "\x1b[38;2;132;204;156m",
        warning: "\x1b[38;2;202;196;132m",
        muted: "\x1b[38;2;132;155;137m"
    },
    tide_pool: {
        border: "\x1b[38;2;134;188;222m",
        title: "\x1b[38;2;87;149;201m",
        command: "\x1b[38;2;188;221;243m",
        success: "\x1b[38;2;132;205;196m",
        warning: "\x1b[38;2;198;202;164m",
        muted: "\x1b[38;2;127;147;171m"
    },
    cherry_blossom: {
        border: "\x1b[38;2;236;191;209m",
        title: "\x1b[38;2;244;150;186m",
        command: "\x1b[38;2;246;212;225m",
        success: "\x1b[38;2;196;214;182m",
        warning: "\x1b[38;2;241;194;178m",
        muted: "\x1b[38;2;179;151;166m"
    },
    lavender_dusk: {
        border: "\x1b[38;2;189;181;231m",
        title: "\x1b[38;2;150;136;224m",
        command: "\x1b[38;2;221;214;245m",
        success: "\x1b[38;2;182;205;194m",
        warning: "\x1b[38;2;226;198;188m",
        muted: "\x1b[38;2;148;145;176m"
    }
};

let themeName = "amber_glow";
let Theme = THEMES[themeName];
const THEME_NAMES = Object.keys(THEMES);

function style(text, ...codes) {
    return `${codes.join("")}${text}${ANSI.Reset}`;
}

function bright(text) {
    return style(text, ANSI.Bright);
}

function dim(text) {
    return style(text, ANSI.Dim);
}

function accent(text) {
    return style(text, Theme.border);
}

function highlight(text) {
    return style(text, Theme.title, ANSI.Bright);
}

function info(text) {
    return style(text, Theme.command);
}

function success(text) {
    return style(text, Theme.success);
}

function warning(text) {
    return style(text, Theme.warning);
}

function subtle(text) {
    return style(text, Theme.muted);
}

function promptLabel() {
    return ` ${style("❯", Theme.title)} `;
}

function setTheme(name) {
    themeName = THEMES[name] ? name : "amber_glow";
    Theme = THEMES[themeName];
}

function nextThemeName(currentName) {
    const currentIndex = THEME_NAMES.indexOf(currentName);
    return THEME_NAMES[(currentIndex + 1) % THEME_NAMES.length];
}

const STATE_FILE = path.join(__dirname, ".state");

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (error) {
        return null;
    }
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function formatLocalDayKey(date, tzName) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tzName,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return `${year}-${month}-${day}`;
}

function formatTimeInZone(date, tzName) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: tzName,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(date);
}

function parseCoordinate(input, fallback, min, max) {
    const trimmed = input.trim();
    if (trimmed === "") {
        return fallback;
    }
    if (!/^[-+]?\d+(\.\d+)?$/.test(trimmed)) {
        return null;
    }
    const value = Number.parseFloat(trimmed);
    if (!Number.isFinite(value) || value < min || value > max) {
        return null;
    }
    return value;
}

function parseMinuteOffset(input, fallback, min = 0, max = 60) {
    const trimmed = input.trim();
    if (trimmed === "") {
        return fallback;
    }
    if (!/^\d+$/.test(trimmed)) {
        return null;
    }
    const value = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(value) || value < min || value > max) {
        return null;
    }
    return value;
}

function isValidTimeZone(value) {
    if (typeof value !== "string" || value.trim() === "") {
        return false;
    }
    try {
        if (typeof Intl.supportedValuesOf === "function") {
            return Intl.supportedValuesOf("timeZone").includes(value.trim());
        }
        new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
        return true;
    } catch (error) {
        return false;
    }
}

function formatMinutesFromNow(minutes) {
    if (minutes <= 1) {
        return "now";
    }
    const rounded = Math.round(minutes);
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    if (hours > 0 && mins > 0) {
        return `${hours}h ${mins}m`;
    }
    if (hours > 0) {
        return `${hours}h`;
    }
    return `${mins}m`;
}

function getBlinkSeparator(now = new Date(), periodSeconds = 2) {
    return Math.floor(now.getSeconds() / periodSeconds) % 2 === 0 ? ":" : " ";
}

function formatBlinkingClock(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(now);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    const separator = getBlinkSeparator(now, 2);
    return `${hour}${separator}${minute}`;
}

function getCelestialStage(currentHour, times, gracePeriodMinutes) { // gracePeriodMinutes is now effectively ignored
    const fajr = times.Fajr;
    const maghrib = times.Maghrib;

    if ([fajr, maghrib].some((value) => value === null)) {
        return "sun"; // Default to sun if times are not available
    }

    const fajrPlusOneHour = (fajr + 1) % 24; // Fajr + 1 hour, handling midnight transition

    // If current time is past Maghrib, it's moon
    // Or if current time is before (Fajr + 1 hour)
    if (currentHour >= maghrib || (currentHour < fajrPlusOneHour && currentHour >= 0)) {
        return "moon";
    } else if (currentHour >= fajrPlusOneHour && currentHour < maghrib) {
        // If current time is after (Fajr + 1 hour) and before Maghrib, it's sun
        return "sun";
    } else {
        return "moon"; // Should cover any remaining cases, e.g., early morning before Fajr + 1 hour
    }
}

function renderCelestialArt(stage, progress, isHolding) {
    const artByStage = {
        moon: [
            "       _..._    ",
            "     .:::'      ",
            "    ::::        ",
            "    ::::        ",
            "    `::::       ",
            "      `':;;.-   "
        ],
        sun: [
            "      \\  |  /   ",
            "    '- .:::. -' ",
            "   '-,:::::::,-' ",
            "   '-`:::::::`-'",
            "    .- ':::' -. ",
            "      /  |  \\   ",
        ]
    };
    const baseArt = artByStage[stage] || artByStage.sun;
    const distMap = getDistanceMap(baseArt, stage);
    return renderFrame(baseArt, distMap, progress, stage, isHolding);
}

function getDistanceMap(art, stage) {
    const { x: cx, y: cy } = CENTERS[stage];

    const height = art.length;
    const width = Math.max(...art.map(r => r.length));

    const map = [];

    for (let y = 0; y < height; y++) {
        map[y] = [];
        for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            map[y][x] = Math.sqrt(dx * dx + dy * dy);
        }
    }

    return map;
}

function renderFrame(art, distMap, progress, stage, isHolding) {
    let output = "";
    // Use theme colors
    const palette = [Theme.muted, Theme.border, Theme.title + ANSI.Bright];

    const maxDist = Math.max(...distMap.flat());

    for (let y = 0; y < art.length; y++) {
        for (let x = 0; x < art[y].length; x++) {
            const char = art[y][x];

            if (char === " ") {
                output += " ";
                continue;
            }

            const d = distMap[y][x];

            let idx = 0;

            if (isHolding) {
                idx = 2;
            } else {
                // Adjust progress to delay the start of the glow
                const effectiveProgress = Math.max(0, progress - 0.1); // Start glow after 10% of EXPAND_TIME

                const threshold = effectiveProgress * maxDist;

                if (d < threshold - 0.5) idx = 2;
                else if (d < threshold + 0.5) idx = 1;
                else idx = 0;
            }

            output += palette[idx] + char + "\x1b[0m";
        }
        output += "\n";
    }

    return output.split('\n').filter(line => line.length > 0); // Return as an array of lines
}

async function askValidated(question, prompt, validate, errorMessage) {
    while (true) {
        const input = await question(prompt);
        const value = validate(input);
        if (value !== null) {
            return value;
        }
        console.log(` ${warning(errorMessage.title)} ${subtle(errorMessage.detail)}`);
    }
}

/**
 * Helper to get visual width of string (handling surrogate pairs and emojis)
 */
function getVisualLength(str) {
    let length = 0;
    for (const char of Array.from(str)) {
        const code = char.codePointAt(0);
        // General Unicode Wide/Emoji range
         if (code > 0xFFFF || (code >= 0x2300 && code <= 0x2BFF)) {
            length += 2;
        } else {
            length += 1;
        }
    }
    return length;
}

/**
 * Pads a string based on its visual length to maintain alignment
 */
function visualPad(str, target, char = " ") {
    const vLen = getVisualLength(str);
    return str + char.repeat(Math.max(0, target - vLen));
}

function printLines(lines) {
    process.stdout.write(`${lines.join("\n")}\n`);
}

function tableLine(content) {
    return ` ${accent(content)}`;
}

function tableRow(columns) {
    return tableLine(`│${ANSI.Reset} ${columns.join(` ${accent("│")}${ANSI.Reset} `)} ${accent("│")}`);
}

/**
 * Cross-platform notification function.
 */
function notify(title, message) {
    try {
        if (os.platform() === "win32") {
            const escapedTitle = title.replace(/'/g, "''");
            const escapedMessage = message.replace(/'/g, "''");
            const psScript = `
                [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
                $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
                $nodes = $template.GetElementsByTagName("text")
                $nodes.Item(0).AppendChild($template.CreateTextNode('${escapedTitle}')) | Out-Null
                $nodes.Item(1).AppendChild($template.CreateTextNode('${escapedMessage}')) | Out-Null
                $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
                [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("PrayerNotifier").Show($toast)
            `;
            spawnSync("powershell", ["-NoProfile", "-Command", psScript]);
        } else if (os.platform() === "linux") {
            spawnSync("notify-send", [title, message]);
        }
    } catch (e) {
        // Silently fail
    }
}

/**
 * Astronomical Calculations (Meeus Algorithm)
 */
class PrayerCalculator {
    constructor(lat, lon, tzName, ihtiyatMinutes = 2) {
        this.lat = lat;
        this.lon = lon;
        this.tzName = tzName;
        this.ihtiyatMinutes = ihtiyatMinutes;
    }

    getMethodLabel() {
        return `Meeus solar calc • Fajr -20° • Isya -18° • Asr standard • Ihtiyat +${this.ihtiyatMinutes}m`;
    }

    _getJD(date) {
        let y = date.getFullYear();
        let m = date.getMonth() + 1;
        let d = date.getDate();
        if (m <= 2) { y -= 1; m += 12; }
        let a = Math.floor(y / 100);
        let b = 2 - a + Math.floor(a / 4);
        return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
    }

    calculateTimes(date) {
        const jd = this._getJD(date);
        const d = jd - 2451545.0;
        const L = (280.466 + 0.9856474 * d) % 360;
        const g = (357.528 + 0.9856003 * d) % 360;
        const lambdaSol = (L + 1.915 * Math.sin(this._rad(g)) + 0.02 * Math.sin(this._rad(2 * g))) % 360;
        const epsilon = 23.439 - 0.0000004 * d;
        const ra = this._deg(Math.atan2(Math.cos(this._rad(epsilon)) * Math.sin(this._rad(lambdaSol)), Math.cos(this._rad(lambdaSol)))) / 15.0;
        const decl = this._deg(Math.asin(Math.sin(this._rad(epsilon)) * Math.sin(this._rad(lambdaSol))));
        const eqT = L / 15.0 - ra % 24;

        const formatter = new Intl.DateTimeFormat('en-US', { timeZone: this.tzName, timeZoneName: 'shortOffset' });
        const parts = formatter.formatToParts(date);
        const offsetPart = parts.find(p => p.type === 'timeZoneName').value;
        const match = offsetPart.match(/GMT([-+]\d+)/);
        const actualTzOffset = match ? parseInt(match[1], 10) : 0;

        const noon = (12 + actualTzOffset - this.lon / 15.0 - eqT) % 24;
        const ha = (alt, dir) => {
            const cosH = (Math.sin(this._rad(alt)) - Math.sin(this._rad(this.lat)) * Math.sin(this._rad(decl))) /
                         (Math.cos(this._rad(this.lat)) * Math.cos(this._rad(decl)));
            if (Math.abs(cosH) > 1) return null;
            return (noon + dir * this._deg(Math.acos(cosH)) / 15.0) % 24;
        };

        const asrAlt = this._deg(Math.atan(1.0 / (1.0 + Math.tan(this._rad(Math.abs(this.lat - decl))))));
        const buf = this.ihtiyatMinutes / 60.0;
        const times = { "Fajr": ha(-20, -1), "Dhuhr": noon, "Asr": ha(asrAlt, 1), "Maghrib": ha(-0.833, 1), "Isya": ha(-18, 1) };
        const res = {};
        for (const [n, v] of Object.entries(times)) { res[n] = v !== null ? (v + buf) % 24 : null; }
        return res;
    }

    _rad(deg) { return deg * Math.PI / 180.0; }
    _deg(rad) { return rad * 180.0 / Math.PI; }

    formatTime(dec) {
        if (dec === null) return "--:--";
        const totalSec = Math.round(dec * 3600);
        const h = Math.floor(totalSec / 3600) % 24;
        const m = Math.floor((totalSec % 3600) / 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
}

/**
 * Main Application
 */
class PrayerApp {
    constructor(lat, lon, tzName, ihtiyatMinutes = 2) {
        this.calc = new PrayerCalculator(lat, lon, tzName, ihtiyatMinutes);
        this.tzName = tzName;
        this.ihtiyatMinutes = ihtiyatMinutes;
        this.gracePeriodMinutes = 0.2;
        this.done = {};
        this.times = {};
        this.notified = new Set();
        this.lastRem = {};
        this.dayKey = "";
        this.monitorHandle = null;
        this.liveHeaderHandle = null;
        this.keyListener = null;
        this.resizeListener = null;
        this.sigintListener = null;
        this.sigtstpListener = null;
        this.sigcontListener = null;
        this.pendingAction = "";
        this.inputRow = 0;
        this.art = null;
        this.artStage = null;
        this.distMap = null;
        this.artAnimationHandle = null;
    }

    updateDay(date) {
        this.dayKey = formatLocalDayKey(date, this.tzName);
        this.times = this.calc.calculateTimes(date);
        this.done = {};
        this.notified.clear();
        this.lastRem = {};
        this.saveState();
    }

    restoreState(savedState, date = new Date()) {
        if (!savedState) {
            return;
        }
        this.applySavedTheme(savedState.theme);
        const todayKey = formatLocalDayKey(date, this.tzName);
        if (savedState.dayKey === todayKey && savedState.done && typeof savedState.done === "object") {
            if (Array.isArray(savedState.done)) {
                this.done = Object.fromEntries(savedState.done.map((name) => [name, "--:--"]));
            } else {
                this.done = { ...savedState.done };
            }
        }
    }

    saveState() {
        saveState({
            lat: this.calc.lat,
            lon: this.calc.lon,
            tzName: this.tzName,
            ihtiyatMinutes: this.ihtiyatMinutes,
            theme: themeName,
            dayKey: this.dayKey,
            done: this.done
        });
    }

    setPromptTheme() {
        this.renderInputLine();
    }

    applySavedTheme(savedTheme) {
        if (!savedTheme) {
            return;
        }
        setTheme(savedTheme);
        this.setPromptTheme();
    }

    cycleTheme() {
        setTheme(nextThemeName(themeName));
        this.setPromptTheme();
        this.saveState();
    }

    getCurrentDecimalHour(now = new Date()) {
        return now.getHours() + now.getMinutes() / 60.0 + now.getSeconds() / 3600.0;
    }

    getNextPrayerInfo(now = new Date()) {
        const current = this.getCurrentDecimalHour(now);
        for (const [name, pHour] of Object.entries(this.times)) {
            if (pHour === null) continue;

            const diff = (pHour - current) * 60.0;

            if (diff >= this.gracePeriodMinutes) { // NEXT PRAYER uses >=
                return {
                    name,
                    time: this.calc.formatTime(pHour),
                    minutesLeft: diff
                };
            }
        }

        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const fajr = this.calc.calculateTimes(tomorrow).Fajr;
        const minutesUntilTomorrowFajr = ((24 - current) + fajr) * 60.0;
        return {
            name: "Fajr",
            time: this.calc.formatTime(fajr),
            minutesLeft: minutesUntilTomorrowFajr
        };
    }

    getPrayerStatus(name) {
        const doneAt = this.done[name];
        if (doneAt) {
            return {
                compact: style(`done ${doneAt}`, Theme.success, ANSI.Bright),
                full: style(visualPad(`DONE ${doneAt} ✓`, 13), Theme.success, ANSI.Bright)
            };
        }
        return {
            compact: style("pending", Theme.warning, ANSI.Bright),
            full: style(visualPad("PENDING ⏳", 12), Theme.warning, ANSI.Bright)
        };
    }

    buildHeaderLines(now = new Date()) {
        const live = this.buildLiveHeaderLines(now);
        const lines = [
            "",
            ` ${highlight("✨ Prayer Notifier")}`,
            ...live.artLines
        ];
        if (live.clockLine)
            lines.push(live.clockLine);
        lines.push(` ${dim(now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }))}`);
        if (live.nextLine)
            lines.push(live.nextLine);
        if (!this.isCompactLayout()) {
          lines.push(
            ` ${subtle(this.calc.getMethodLabel())}`,
            ` ${subtle(`Location: ${this.calc.lat}, ${this.calc.lon} (${this.tzName})`)}`,
          );
        }
        return lines;
    }

    buildLiveHeaderLines(now = new Date()) {
        const nextPrayer = this.getNextPrayerInfo(now);
        const terminalHeight = process.stdout.rows || 31;
        const showArt = !this.isCompactLayout() ? terminalHeight >= 31 : terminalHeight >= 26; // Only show art if height is sufficient
        const showClock = !this.isCompactLayout() ? terminalHeight >= 25 : terminalHeight >= 20;
        const showNext = !this.isCompactLayout() ? terminalHeight >= 25 : terminalHeight >= 20;

        let progress = 0;
        let isHolding = false;
        const elapsed = now.getTime() - this.artCycleStart;

        if (elapsed < EXPAND_TIME) {
            progress = elapsed / EXPAND_TIME;
        } else if (elapsed < EXPAND_TIME + HOLD_TIME) {
            progress = 1;
            isHolding = true;
        } else if (elapsed < EXPAND_TIME + HOLD_TIME + FADE_OUT_TIME) {
            // Fade out phase
            const fadeOutElapsed = elapsed - (EXPAND_TIME + HOLD_TIME);
            progress = 1 - (fadeOutElapsed / FADE_OUT_TIME); // Progress goes from 1 to 0
        } else {
            progress = 0;
            isHolding = false;
        }

        const currentHour = this.getCurrentDecimalHour(now);
        const actualStage = getCelestialStage(currentHour, this.times, this.gracePeriodMinutes);

        // If the celestial stage has changed OR if the current animation cycle has completed,
        // reset the animation for the *current* actual stage.
        if (this.artStage !== actualStage || (now.getTime() - this.artCycleStart >= SWITCH_INTERVAL)) {
            this.artStage = actualStage; // Ensure artStage always reflects the actual stage
            this.artCycleStart = now.getTime();    // Start a new animation cycle
        }
        const currentArt = showArt ? renderCelestialArt(this.artStage, progress, isHolding) : [];

        return {
            artLines: currentArt.map((line) => ` ${line}`),
            clockLine: showClock ? ` ${bright(formatBlinkingClock(now))}` : '',
            nextLine: showNext ? ` ${info(`Next: ${nextPrayer.name} at ${nextPrayer.time} (${formatMinutesFromNow(nextPrayer.minutesLeft)})`)}` : ''
        };
    }

    buildCommandLines() {
        return [
            ` ${bright("Commands:")}`,
            ` ${info("• d?")}\tDone prayer`,
            ` ${info("• u?")}\tUndo prayer`,
            ` ${info("• t")}\tTheme`,
            ` ${info("• q")}\tQuit`,
            ""
        ];
    }

    isCompactLayout() {
        return (process.stdout.columns || 80) < 60;
    }

    refreshUI() {
        process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
        const liveHeaderLines = this.buildLiveHeaderLines();
        this.liveHeaderStartRow = 2;
        this.liveClockRow = this.liveHeaderStartRow + liveHeaderLines.artLines.length;
        this.liveNextPrayerRow = this.liveClockRow + 2;
        const tableLines = this.isCompactLayout()
            ? this.renderCompactPrayerLines()
            : this.renderFullPrayerTable();
        const allLines = [...this.buildHeaderLines(), ...tableLines, ...this.buildCommandLines()];
        printLines(allLines);
        this.inputRow = allLines.length;
        this.renderInputLine();
    }

    updateLiveHeader() {
        const lines = this.buildLiveHeaderLines();
        process.stdout.write("\x1b7");
        for (let index = 0; index < lines.artLines.length; index += 1) {
            this.writeScreenLine(this.liveHeaderStartRow + index, lines.artLines[index]);
        }
        if (lines.clockLine) {
            this.writeScreenLine(this.liveClockRow, lines.clockLine);
        }
        if (lines.nextLine) {
            this.writeScreenLine(this.liveNextPrayerRow, lines.nextLine);
        }
        process.stdout.write("\x1b8");
    }

    writeScreenLine(row, text) {
        readline.cursorTo(process.stdout, 0, row);
        readline.clearLine(process.stdout, 0);
        process.stdout.write(text);
    }

    getPendingActionHint() {
        if (!this.pendingAction) {
            return subtle("Awaiting key");
        }
        const label = this.pendingAction === "d" ? "done" : "undo";
        const choices = [
            `${highlight("f")}ajr`,
            `${highlight("d")}huhr`,
            `${highlight("a")}sr`,
            `${highlight("m")}aghrib`,
            `${highlight("i")}sya`
        ].join(" ");
        return `${subtle(`${label}:`)} ${choices}`;
    }

    renderInputLine() {
        readline.cursorTo(process.stdout, 0, this.inputRow);
        readline.clearLine(process.stdout, 0);
        process.stdout.write(`${promptLabel()}${this.pendingAction}${this.getPendingActionHint()}`);
    }

    renderFullPrayerTable() {
        const lines = [
            tableLine("┌────────────┬──────────┬──────────────┐"),
            tableRow([
                highlight(visualPad("Prayer", 10)),
                highlight(visualPad("Time", 8)),
                highlight(visualPad("Status", 12))
            ]),
            tableLine("├────────────┼──────────┼──────────────┤")
        ];

        for (const [name, pHour] of Object.entries(this.times)) {
            const status = this.getPrayerStatus(name);

            lines.push(tableRow([
                visualPad(name, 10),
                visualPad(this.calc.formatTime(pHour), 8),
                status.full
            ]));
        }

        lines.push(tableLine("└────────────┴──────────┴──────────────┘"), "");
        return lines;
    }

    renderCompactPrayerLines() {
        const lines = [
            ` ${bright("Prayer Times")} ${subtle("(compact)")}`,
            ` ${accent("────────────────────────")}`
        ];

        for (const [name, pHour] of Object.entries(this.times)) {
            const status = this.getPrayerStatus(name);
            lines.push(` ${bright(visualPad(name, 8))} ${this.calc.formatTime(pHour)}  ${status.compact}`);
        }

        lines.push("");
        return lines;
    }

    prayerNameFromKey(key) {
        return {
            f: "Fajr",
            d: "Dhuhr",
            a: "Asr",
            m: "Maghrib",
            i: "Isya"
        }[key] || "";
    }

    handlePrayerCommand(action, prayerName) {
        if (this.times[prayerName] === undefined) {
            return;
        }
        if (action === "done") {
            if (!this.done[prayerName]) {
                this.done[prayerName] = formatTimeInZone(new Date(), this.tzName);
            }
        } else {
            delete this.done[prayerName];
        }
        this.saveState();
    }

    handleKeypress(str, key = {}) {
        if (key.ctrl && key.name === "c") {
            this.shutdown(0);
            return;
        }

        if (key.ctrl && key.name === "z") {
            this.suspend();
            return;
        }

        if (key.name === "escape") {
            this.pendingAction = "";
            this.renderInputLine();
            return;
        }

        if (key.name === "backspace" || key.name === "delete") {
            this.pendingAction = "";
            this.renderInputLine();
            return;
        }

        if (key.name === "return" || key.name === "enter") {
            this.pendingAction = "";
            this.renderInputLine();
            return;
        }

        const input = (str || key.name || "").toLowerCase();
        if (!input) {
            return;
        }

        if (!this.pendingAction) {
            if (input === "d" || input === "u") {
                this.pendingAction = input;
                this.renderInputLine();
                return;
            }
            if (input === "t") {
                this.cycleTheme();
                this.refreshUI();
                return;
            }
            if (input === "q") {
                this.shutdown(0);
                return;
            }
            return;
        }

        const prayerName = this.prayerNameFromKey(input);
        if (prayerName) {
            const action = this.pendingAction === "d" ? "done" : "undo";
            this.handlePrayerCommand(action, prayerName);
            this.pendingAction = "";
            this.refreshUI();
            return;
        }

        this.pendingAction = "";
        this.renderInputLine();
    }

    enableInteractiveInput() {
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        if (!this.keyListener) {
            this.keyListener = (str, key) => {
                this.handleKeypress(str, key);
            };
        }
        process.stdin.on("keypress", this.keyListener);
    }

    disableInteractiveInput() {
        if (this.keyListener) {
            process.stdin.off("keypress", this.keyListener);
        }
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
        process.stdin.pause();
    }

    suspend() {
        this.disableInteractiveInput();
        if (this.sigtstpListener) {
            process.off("SIGTSTP", this.sigtstpListener);
        }
        process.stdout.write("\n");
        process.kill(process.pid, "SIGTSTP");
    }

    resumeFromSuspend() {
        if (this.sigtstpListener) {
            process.off("SIGTSTP", this.sigtstpListener);
            process.on("SIGTSTP", this.sigtstpListener);
        }
        process.stdin.resume();
        this.enableInteractiveInput();
        this.pendingAction = "";
        this.refreshUI();
    }

    shutdown(exitCode = 0) {
        if (this.monitorHandle) {
            clearInterval(this.monitorHandle);
            this.monitorHandle = null;
        }
        if (this.liveHeaderHandle) {
            clearInterval(this.liveHeaderHandle);
            this.liveHeaderHandle = null;
        }
        if (this.artAnimationHandle) {
            clearInterval(this.artAnimationHandle);
            this.artAnimationHandle = null;
        }
        this.disableInteractiveInput();
        this.keyListener = null;
        if (this.resizeListener) {
            process.stdout.off("resize", this.resizeListener);
            this.resizeListener = null;
        }
        if (this.sigintListener) {
            process.off("SIGINT", this.sigintListener);
            this.sigintListener = null;
        }
        if (this.sigtstpListener) {
            process.off("SIGTSTP", this.sigtstpListener);
            this.sigtstpListener = null;
        }
        if (this.sigcontListener) {
            process.off("SIGCONT", this.sigcontListener);
            this.sigcontListener = null;
        }
        process.stdout.write("\n");
        process.exit(exitCode);
    }

    monitor() {
        this.monitorHandle = setInterval(() => {
            const now = new Date();
            if (formatLocalDayKey(now, this.tzName) !== this.dayKey) {
                this.updateDay(now);
                this.refreshUI();
            }
            const curr = this.getCurrentDecimalHour(now);
            for (const [name, pHour] of Object.entries(this.times)) {
                if (pHour === null) continue;
                const diff = (pHour - curr) * 60.0;
                if (diff > 29.5 && diff <= 30.5 && !this.notified.has(`${name}_30`)) {
                    notify("Upcoming Prayer", `${name} in 30 mins.`);
                    this.notified.add(`${name}_30`);
                }
                if (diff >= 0 && diff <= this.gracePeriodMinutes && !this.notified.has(name)) {
                    notify("Prayer Time", `It is now time for ${name}.`);
                    this.notified.add(name);
                }
                if (diff < -30 && !this.done[name]) {
                    const last = this.lastRem[name] || pHour;
                    if ((curr - last) * 60.0 >= 30.0) {
                        notify("Prayer Reminder", `You haven't marked ${name} as done yet!`);
                        this.lastRem[name] = curr;
                    }
                }
            }
        }, 2000);
    }

    startLiveHeaderUpdates() {
        this.artAnimationHandle = setInterval(() => {

            this.updateLiveHeader();
        }, INTERVAL);
    }

    async start() {
        this.monitor();
        this.startLiveHeaderUpdates();
        this.refreshUI();
        this.enableInteractiveInput();
        if (process.stdout.isTTY) {
            this.resizeListener = () => {
                this.refreshUI();
            };
            process.stdout.on("resize", this.resizeListener);
        }
        this.sigintListener = () => {
            this.shutdown(0);
        };
        this.sigtstpListener = () => {
            this.suspend();
        };
        this.sigcontListener = () => {
            this.resumeFromSuspend();
        };

        process.on("SIGINT", this.sigintListener);
        process.on("SIGTSTP", this.sigtstpListener);
        process.on("SIGCONT", this.sigcontListener);
    }
}

async function setup() {
    const savedState = loadState();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (q) => new Promise((res) => rl.question(q, res));
    process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
    console.log(`\n ${bright("Prayer Notifier")}\n`);
    const dLat = savedState?.lat ?? -6.1751;
    const dLon = savedState?.lon ?? 106.8272;
    const dTz = savedState?.tzName ?? "Asia/Jakarta";
    const dIhtiyat = savedState?.ihtiyatMinutes ?? 2;
    const lat = await askValidated(
        question,
        ` Latitude  [${dLat}]: `,
        (input) => parseCoordinate(input, dLat, -90, 90),
        { title: "Invalid latitude.", detail: "Use a number between -90 and 90." }
    );
    const lon = await askValidated(
        question,
        ` Longitude [${dLon}]: `,
        (input) => parseCoordinate(input, dLon, -180, 180),
        { title: "Invalid longitude.", detail: "Use a number between -180 and 180." }
    );
    const tz = await askValidated(
        question,
        ` Timezone  [${dTz}]: `,
        (input) => {
            const candidate = input.trim() === "" ? dTz : input.trim();
            return isValidTimeZone(candidate) ? candidate : null;
        },
        { title: "Invalid timezone.", detail: "Use an IANA zone like Asia/Jakarta." }
    );
    const ihtiyatMinutes = await askValidated(
        question,
        ` Ihtiyat   [${dIhtiyat}]: `,
        (input) => parseMinuteOffset(input, dIhtiyat, 0, 60),
        { title: "Invalid ihtiyat.", detail: "Use a whole number of minutes between 0 and 60." }
    );

    rl.close();
    const app = new PrayerApp(lat, lon, tz, ihtiyatMinutes);
    app.updateDay(new Date());
    app.restoreState(savedState);
    app.saveState();
    app.start();
}

setup().catch(err => { console.error("Error:", err); process.exit(1); });
