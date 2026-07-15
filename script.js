/* ======================================================================
 * Rate Your Day  -  vanilla JS, minimal chrome
 *
 * 3/4 circular tracker of daily 1..10 ratings (red -> green gradient)
 * covering July..December of a chosen year. Left-click a cell to be
 * prompted for a rating; right-click clears it.
 *
 * Storage: browser localStorage always; optional cloud sync via JSONBin.io
 * ====================================================================== */

/* ---------- Constants ---------- */
/* Ring order runs from the outermost (index 0) to the innermost. The
 * user wants December on the outside and July on the inside.        */
const MONTHS_ORDER = ['Dec','Nov','Oct','Sep','Aug','Jul'];
const MONTH_NUM    = { Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };

const SVG_NS   = 'http://www.w3.org/2000/svg';
const CENTER_R = 110;
const OUTER_R  = 430;
const DAY_LBL_R = 472;
const RINGS    = MONTHS_ORDER.length;                  // 6
const DAYS     = 31;
const RING_W   = (OUTER_R - CENTER_R) / RINGS;

const ARC_SPAN     = 270;
const ARC_START    = 0;
const ANGLE_PER_DAY = ARC_SPAN / DAYS;

const CELL_MARGIN_R = 3;
const CELL_MARGIN_A = 0.7;
const CORNER        = 4;

const STORAGE_KEY = 'rateYourDayV1';
const THEME_KEY   = 'rateYourDayTheme';

/* ---------- JSONBin Config ---------- */
const JSONBIN_ID  = '%%JSONBIN_ID%%';
const JSONBIN_KEY = '%%JSONBIN_KEY%%';

/* ---------- Logging ---------- */
const LOG_PREFIX = '[RateYourDay]';
function log     (...a) { console.log  (LOG_PREFIX, ...a); }
function logWarn (...a) { console.warn (LOG_PREFIX, ...a); }
function logError(...a) { console.error(LOG_PREFIX, ...a); }
function logGroup(name) { console.group(LOG_PREFIX + ' ' + name); }
function logEnd()       { console.groupEnd(); }

/* ---------- State ---------- */
let state = {
    startYear: new Date().getFullYear(),
    ratings: {}                             // { "YYYY-MM-DD": 1..10 }
};

let syncTimeout = null;
let statusTimer = null;

/* ====================================================================== */
/*  Color gradient                                                         */
/* ====================================================================== */

/* Two-sided scale, meeting at neutral white at rating 5:
 *   1 -> deep red (hue 0, sat 75%, light 32%)
 *   5 -> white   (sat 0%, light 92%)   -- no red, no green tint
 *  10 -> deep green (hue 140, sat 75%, light 32%)
 * Saturation grows linearly from 0 at the midpoint out to each end,
 * lightness moves in lockstep. 1..5 uses only the red hue, 6..10 only
 * the green hue, so the two halves never share colour.               */
function ratingColor(r) {
    if (typeof r !== 'number' || r < 1 || r > 10) return null;
    if (r <= 5) {
        const t   = (r - 1) / 4;                    // 0 (r=1) .. 1 (r=5)
        const sat = 75 * (1 - t);                   // 75% -> 0%
        const l   = 32 + t * 60;                    // 32% -> 92%
        return `hsl(0, ${sat.toFixed(1)}%, ${l.toFixed(1)}%)`;
    }
    const t   = (r - 5) / 5;                        // 0 (r=5) .. 1 (r=10)
    const sat = 75 * t;                             // 0% -> 75%
    const l   = 92 - t * 60;                        // 92% -> 32%
    return `hsl(140, ${sat.toFixed(1)}%, ${l.toFixed(1)}%)`;
}

/* ====================================================================== */
/*  Storage & Cloud Sync                                                  */
/* ====================================================================== */

function serialize() { return JSON.stringify(state, null, 2); }

function deserialize(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object') throw new Error('Invalid file');
    const clean = {
        startYear: typeof obj.startYear === 'number' ? obj.startYear : new Date().getFullYear(),
        ratings:   {}
    };
    if (obj.ratings && typeof obj.ratings === 'object') {
        for (const [k, v] of Object.entries(obj.ratings)) {
            const n = Number(v);
            if (Number.isInteger(n) && n >= 1 && n <= 10) clean.ratings[k] = n;
        }
    }
    return clean;
}

function saveLocal(skipCloud = false) {
    try { localStorage.setItem(STORAGE_KEY, serialize()); } catch (e) { logWarn('localStorage write failed', e); }
    
    if (!skipCloud && !JSONBIN_ID.startsWith('%%')) {
        clearTimeout(syncTimeout);
        showStatus('Saving locally... (Cloud sync pending)');
        syncTimeout = setTimeout(() => {
            saveToCloud();
        }, 2000);
    }
}

function loadLocal() {
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        if (s) state = deserialize(s);
    } catch (e) { console.warn('localStorage restore failed', e); }
}

async function loadFromCloud() {
    logGroup('loadFromCloud');
    log('JSONBIN_ID:', JSONBIN_ID);
    log('JSONBIN_KEY:', JSONBIN_KEY ? (JSONBIN_KEY.startsWith('%%') ? 'placeholder' : 'provided (hidden)') : 'missing');
    
    if (!JSONBIN_ID || JSONBIN_ID.startsWith('%%') || !JSONBIN_KEY || JSONBIN_KEY.startsWith('%%')) {
        log('Keys missing or not replaced by build script. Aborting cloud load.');
        logEnd();
        return false;
    }
    
    showStatus('Fetching from Cloud...');
    try {
        const url = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`;
        log('Fetching from:', url);
        const res = await fetch(url, {
            headers: { 'X-Access-Key': JSONBIN_KEY }
        });
        log('Response status:', res.status);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        log('Response data:', data);
        if (data && data.record) {
            state = deserialize(JSON.stringify(data.record));
            log('Deserialized state:', state);
            saveLocal(true);
            renderTracker();
            showStatus('Loaded from Cloud.');
            logEnd();
            return true;
        } else {
            logWarn('Data format unexpected (missing .record property)');
        }
    } catch (e) {
        logError('Cloud load failed', e);
        showStatus('Cloud load failed: ' + e.message, true);
    }
    logEnd();
    return false;
}

async function saveToCloud() {
    logGroup('saveToCloud');
    if (!JSONBIN_ID || JSONBIN_ID.startsWith('%%') || !JSONBIN_KEY || JSONBIN_KEY.startsWith('%%')) {
        log('Keys missing. Aborting cloud save.');
        logEnd();
        return;
    }
    showStatus('Saving to Cloud...');
    try {
        const payload = serialize();
        log('Payload to send:', payload);
        const url = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}`;
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': JSONBIN_KEY
            },
            body: payload
        });
        log('Response status:', res.status);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        log('Save response data:', data);
        showStatus('Saved to Cloud.');
    } catch (e) {
        logError('Cloud save failed', e);
        showStatus('Cloud save failed: ' + e.message, true);
    }
    logEnd();
}

/* ====================================================================== */
/*  Domain helpers                                                         */
/* ====================================================================== */

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

function cellKey(ringIdx, day) {
    const mNum = MONTH_NUM[MONTHS_ORDER[ringIdx]];
    return `${state.startYear}-${String(mNum).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

/* True if the given ring/day cell is today (in the current calendar year). */
function isToday(ringIdx, day) {
    const now = new Date();
    if (now.getFullYear() !== state.startYear) return false;
    return (now.getMonth() + 1) === MONTH_NUM[MONTHS_ORDER[ringIdx]]
        && now.getDate() === day;
}

function getRating(ringIdx, day) { return state.ratings[cellKey(ringIdx, day)] || 0; }

function setRating(ringIdx, day, value) {
    const key = cellKey(ringIdx, day);
    if (!value || value < 1 || value > 10) {
        delete state.ratings[key];
        log('setRating: cleared', key);
    } else {
        state.ratings[key] = value;
        log('setRating: set', key, '=', value);
    }
    saveLocal();
    renderTracker();
}

/* Ask the user for a rating for the clicked cell. */
function promptRating(ringIdx, day) {
    const cur = getRating(ringIdx, day);
    const raw = window.prompt(
        `Rate ${cellKey(ringIdx, day)} on a scale of 1 to 10.\n` +
        `(Enter 0 or leave blank to clear this day.)`,
        cur ? String(cur) : ''
    );
    if (raw === null) return;                          // cancelled
    const trimmed = raw.trim();
    /* Blank or "0" clears the cell. */
    if (trimmed === '' || trimmed === '0') { setRating(ringIdx, day, 0); return; }
    const n = parseInt(trimmed, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 10) setRating(ringIdx, day, n);
    else showStatus('Please enter a whole number from 1 to 10.', true);
}

/* ====================================================================== */
/*  SVG geometry                                                           */
/* ====================================================================== */

function polar(r, deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

function ringSegmentPath(rIn, rOut, aStart, aEnd) {
    const p1 = polar(rIn,  aStart);
    const p2 = polar(rOut, aStart);
    const p3 = polar(rOut, aEnd);
    const p4 = polar(rIn,  aEnd);
    const large = (aEnd - aStart) > 180 ? 1 : 0;
    return [
        `M ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
        `L ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`,
        `A ${rOut} ${rOut} 0 ${large} 1 ${p3.x.toFixed(3)} ${p3.y.toFixed(3)}`,
        `L ${p4.x.toFixed(3)} ${p4.y.toFixed(3)}`,
        `A ${rIn} ${rIn} 0 ${large} 0 ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
        'Z'
    ].join(' ');
}

/* ====================================================================== */
/*  Rendering                                                              */
/* ====================================================================== */

function renderTracker() {
    const svg = document.getElementById('tracker');
    if (!svg) return;

    /* Defensive: never let a bad state break the render. Cells must
     * ALWAYS be drawn, even if we're staring at an exception. */
    if (!state || typeof state !== 'object') state = { startYear: new Date().getFullYear(), ratings: {} };
    if (typeof state.startYear !== 'number') state.startYear = new Date().getFullYear();
    if (!state.ratings || typeof state.ratings !== 'object') state.ratings = {};

    try { while (svg.firstChild) svg.removeChild(svg.firstChild); } catch (_) {}
    svg.oncontextmenu = ev => ev.preventDefault();

    /* --- Day cells --- */
    for (let m = 0; m < RINGS; m++) {
        const rOut = OUTER_R - m * RING_W;
        const rIn  = rOut - RING_W;
        let dim = 31;
        try { dim = daysInMonth(state.startYear, MONTH_NUM[MONTHS_ORDER[m]]); }
        catch (_) { dim = 31; }

        for (let d = 1; d <= DAYS; d++) {
            if (d > dim) continue;
            try {
            const aStart = ARC_START + (d - 1) * ANGLE_PER_DAY;
            const aEnd   = ARC_START + d * ANGLE_PER_DAY;

            const rMid      = (rIn + rOut) / 2;
            const cornerDeg = (CORNER / rMid) * (180 / Math.PI);
            const rInI      = rIn + CELL_MARGIN_R + CORNER;
            const rOutI     = rOut - CELL_MARGIN_R - CORNER;
            const aStartI   = aStart + CELL_MARGIN_A + cornerDeg;
            const aEndI     = aEnd - CELL_MARGIN_A - cornerDeg;
            if (rOutI <= rInI || aEndI <= aStartI) continue;

            const pathD  = ringSegmentPath(rInI, rOutI, aStartI, aEndI);
            const rating = getRating(m, d);

            /* Today marker: only while the cell is still unrated. Drawn
             * FIRST (under the cell) so only the outer band peeks out
             * as a subtle border around today's empty cell.           */
            if (isToday(m, d) && !rating) {
                const marker = document.createElementNS(SVG_NS, 'path');
                marker.setAttribute('d', pathD);
                marker.setAttribute('class', 'today-marker');
                marker.setAttribute('stroke-width', String(CORNER * 2 + 8));
                svg.appendChild(marker);
            }

            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', pathD);
            path.setAttribute('stroke-width', String(CORNER * 2));

            const color = ratingColor(rating);
            if (color) {
                /* Use inline `style` (not setAttribute('fill', ...)) so the
                 * fill and the same-colour stroke that gives the rounded
                 * corners are BOTH forced to the exact same value even if
                 * some CSS rule tries to override them. Any mismatch here
                 * makes the cell look like a filled centre with a
                 * differently-coloured outline.                          */
                path.setAttribute('class', 'seg rated');
                path.setAttribute('style', `fill:${color};stroke:${color}`);
            } else {
                path.setAttribute('class', 'seg empty');
            }

            path.addEventListener('click', ev => {
                ev.preventDefault();
                promptRating(m, d);
            });
            path.addEventListener('contextmenu', ev => {
                ev.preventDefault();
                setRating(m, d, 0);
            });

            const title = document.createElementNS(SVG_NS, 'title');
            title.textContent = `${cellKey(m, d)}${rating ? '  -  ' + rating + '/10' : ''}`;
            path.appendChild(title);

            svg.appendChild(path);
            } catch (cellErr) {
                console.warn('Skipping bad cell', m, d, cellErr);
            }
        }
    }

    /* --- Day-of-month labels --- */
    for (let d = 1; d <= DAYS; d++) {
        const a = ARC_START + (d - 1) * ANGLE_PER_DAY + ANGLE_PER_DAY / 2;
        const p = polar(DAY_LBL_R, a);
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', p.x);
        t.setAttribute('y', p.y);
        t.setAttribute('class', 'day-label');
        t.setAttribute('dominant-baseline', 'middle');
        t.textContent = d;
        svg.appendChild(t);
    }

    /* --- Month labels: horizontal text stacked vertically along a
     *     single vertical line inside the empty top-left quadrant.
     *     text-anchor="start" locks EVERY label's LEFT edge to the same
     *     x so the column has one identical horizontal indent (glyph-
     *     width differences no longer stagger the column).             */
    const monthLabelX = -70;
    for (let m = 0; m < RINGS; m++) {
        const rOut = OUTER_R - m * RING_W;
        const rIn  = rOut - RING_W;
        const rMid = (rIn + rOut) / 2;
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', monthLabelX);
        t.setAttribute('y', -rMid);
        t.setAttribute('class', 'month-label');
        t.setAttribute('text-anchor', 'start');
        t.setAttribute('dominant-baseline', 'middle');
        t.textContent = MONTHS_ORDER[m].toUpperCase();
        svg.appendChild(t);
    }

    /* --- Center: clickable year + range (no bordered disc) --- */
    const yr = document.createElementNS(SVG_NS, 'text');
    yr.setAttribute('x', 0); yr.setAttribute('y', -10);
    yr.setAttribute('class', 'center-text');
    yr.setAttribute('dominant-baseline', 'middle');
    yr.textContent = String(state.startYear);
    yr.addEventListener('click', () => {
        const raw = window.prompt('Year:', String(state.startYear));
        if (raw === null) return;
        const y = parseInt(raw, 10);
        if (Number.isInteger(y) && y >= 2000 && y <= 2100) {
            state.startYear = y;
            saveLocal();
            renderTracker();
        }
    });
    const yrTitle = document.createElementNS(SVG_NS, 'title');
    yrTitle.textContent = 'Click to change year';
    yr.appendChild(yrTitle);
    svg.appendChild(yr);

    const sub = document.createElementNS(SVG_NS, 'text');
    sub.setAttribute('x', 0); sub.setAttribute('y', 22);
    sub.setAttribute('class', 'center-sub');
    sub.setAttribute('dominant-baseline', 'middle');
    sub.textContent = 'Jul - Dec';
    svg.appendChild(sub);
}

/* ====================================================================== */
/*  SVG sizing                                                             */
/* ====================================================================== */

function resizeTracker() {
    const stage = document.querySelector('.stage');
    if (!stage) return;
    /* Fallback to the viewport if the flex container isn't laid out yet
     * - can happen on the very first tick after DOMContentLoaded.       */
    const w = stage.clientWidth  || (window.innerWidth  - 40);
    const h = stage.clientHeight || (window.innerHeight - 40);
    const size = Math.max(260, Math.min(w, h));
    const svg  = document.getElementById('tracker');
    svg.style.width  = size + 'px';
    svg.style.height = size + 'px';
}

/* ====================================================================== */
/*  Status                                                                 */
/* ====================================================================== */

function showStatus(msg, isError) {
    const el = document.getElementById('statusMsg');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ''; el.classList.remove('error'); }, 4000);
}

/* ====================================================================== */
/*  PDF                                                                    */
/* ====================================================================== */

async function exportPdf() {
    const target = document.getElementById('printRoot');
    showStatus('Generating PDF ...');
    /* Suppress the pulsing today-highlight while rendering the PDF. */
    document.body.classList.add('exporting');
    try {
        const canvas = await html2canvas(target, {
            scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
        });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
        const w = canvas.width * ratio;
        const h = canvas.height * ratio;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG',
                     (pageW - w) / 2, (pageH - h) / 2, w, h);
        pdf.save(`rate-your-day-${state.startYear}-Jul-Dec.pdf`);
        showStatus('PDF exported.');
    } catch (e) {
        console.error(e);
        showStatus('PDF export failed: ' + e.message, true);
    } finally {
        document.body.classList.remove('exporting');
    }
}

/* ====================================================================== */
/*  Bootstrap                                                              */
/* ====================================================================== */

/* ---------- Theme ---------- */
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (_) {}
}
function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'light' ? 'dark' : 'light');
}
function initTheme() {
    let t = 'light';
    try { t = localStorage.getItem(THEME_KEY) || 'light'; } catch (_) {}
    applyTheme(t);
}

function bindEvents() {
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    document.getElementById('syncBtn').addEventListener('click', () => {
        if (!JSONBIN_ID.startsWith('%%')) saveToCloud();
        else showStatus('Cloud sync not configured.', true);
    });
    document.getElementById('pdfBtn').addEventListener('click', exportPdf);
    document.getElementById('printBtn').addEventListener('click', () => window.print());
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (!confirm('Clear ALL ratings?')) return;
        state.ratings = {};
        saveLocal();
        renderTracker();
        showStatus('Cleared.');
    });
    window.addEventListener('resize',           resizeTracker);
    window.addEventListener('load',             resizeTracker);
    document.addEventListener('fullscreenchange', () => {
        /* Layout can lag one frame behind a fullscreen toggle. */
        resizeTracker();
        requestAnimationFrame(resizeTracker);
    });
    setupKeyboardShortcuts();
}

/* ---------- Keyboard shortcuts ----------
 *   T          toggle light/dark theme
 *   H  or  M   hide/show the corner menu + status (for clean screenshots)
 * Shortcuts are ignored when the user is typing in an <input>/<textarea>
 * or when a modifier key (Ctrl / Alt / Meta) is held so we don't fight
 * with browser shortcuts.                                              */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', ev => {
        const tgt = ev.target;
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
        if (ev.ctrlKey || ev.altKey || ev.metaKey) return;

        const k = ev.key.toLowerCase();
        if (k === 't') {
            ev.preventDefault();
            toggleTheme();
            log('Shortcut: toggled theme ->', document.documentElement.getAttribute('data-theme'));
            showStatus('Theme: ' + document.documentElement.getAttribute('data-theme'));
        } else if (k === 'h' || k === 'm') {
            ev.preventDefault();
            document.body.classList.toggle('menu-hidden');
            const hidden = document.body.classList.contains('menu-hidden');
            log('Shortcut: menu-hidden =', hidden);
            if (!hidden) showStatus('Menu shown (press H to hide)');
        }
    });
}

/* Try every source in order and stop at the first that produces data.
 * Any exception is caught so the tracker always renders regardless.  */
async function loadInitialState() {
    logGroup('loadInitialState');
    
    /* 1. Cloud snapshot (JSONBin) */
    if (!JSONBIN_ID.startsWith('%%')) {
        log('loadInitialState: trying cloud fetch');
        const ok = await loadFromCloud();
        if (ok) {
            logEnd();
            return;
        }
    }

    /* 2. localStorage snapshot */
    if (localStorage.getItem(STORAGE_KEY)) {
        log('loadInitialState: reading localStorage');
        try { loadLocal(); } catch (e) { logWarn('loadLocal failed:', e); }
        const count = Object.keys(state.ratings).length;
        log('loadInitialState: localStorage yielded', count, 'ratings');
        if (count > 0) {
            if (!JSONBIN_ID.startsWith('%%')) {
                saveToCloud(); // Sync local data up to cloud
            }
            showStatus('Loaded from browser storage.');
            logEnd();
            return;
        }
    }

    logEnd();
}

async function init() {
    log('init() begin  |  UA =', navigator.userAgent);

    try { initTheme(); } catch (e) { logError('initTheme failed', e); }
    if (typeof state !== 'object' || state === null) {
        state = { startYear: new Date().getFullYear(), ratings: {} };
    }
    state.startYear = new Date().getFullYear();
    log('initial state', { startYear: state.startYear, ratings: 0 });

    /* --- Render the tracker IMMEDIATELY. Empty cells are drawn first
     *     so the user always sees the wheel, no matter what else may
     *     fail during data loading below.                             */
    try { bindEvents();       } catch (e) { logError('bindEvents', e); }
    try { renderTracker();    } catch (e) { logError('First render failed:', e); }
    try { resizeTracker();    } catch (e) { logError('resizeTracker', e); }
    requestAnimationFrame(() => { try { resizeTracker(); } catch (_) {} });

    /* --- Load data in the background, catching everything --- */
    try {
        await loadInitialState();
    } catch (e) {
        logError('loadInitialState failed:', e);
        showStatus('Load failed: ' + e.message, true);
    }

    log('after load     |  ratings=', Object.keys(state.ratings).length);

    /* --- Re-render with whatever we managed to load --- */
    try { renderTracker();       } catch (e) { logError('Second render failed:', e); }

    log('init() done');
}

document.addEventListener('DOMContentLoaded', init);
