/**
 * Puffer Card
 * Custom Lovelace card that visually represents a buffer tank / hot-water
 * cylinder with 1 to 4 temperatures placed at different heights.
 * Optionally displays a history chart below (or above) the tank, and up to
 * four extra values of any entity (pressure, pump state, ...) at a chosen
 * position.
 *
 * Repo: https://github.com/giorgioparri/puffer-card
 * License: MIT
 */

import { LitElement, html, css, svg } from "lit";

import { TRANSLATIONS, REFERENCE_LANG } from "./i18n.js";

// Replaced at build time by scripts/build.mjs: from the git tag on releases,
// from package.json otherwise. Never edit this value by hand.
const VERSION = __VERSION__;

/* -------------------------------------------------------------------------- */
/*  Localization                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every language ships inside the bundle, so lookups are synchronous and can
 * never fail: no fetch, no loading state, and no separate inline English
 * fallback table that could drift out of sync with translations/en.json.
 */
function langCandidates(hass) {
  const raw = (hass && (hass.locale?.language || hass.language)) || REFERENCE_LANG;
  const base = raw.split("-")[0];
  return [...new Set([raw, base, REFERENCE_LANG])];
}

function localize(hass, key) {
  for (const l of langCandidates(hass)) {
    const dict = TRANSLATIONS[l];
    if (dict && dict[key] != null) return dict[key];
  }
  return key;
}

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

const POSITIONS = [
  { key: "top",    labelKey: "label_top"    },
  { key: "middle", labelKey: "label_middle" },
  { key: "extra",  labelKey: "label_extra"  },
  { key: "bottom", labelKey: "label_bottom" },
];

/** Where the extra values (`info`) can be placed. The first one is the default. */
const INFO_POSITIONS = ["top", "inside", "between", "bottom", "left"];

/** Maximum number of extra values. */
const INFO_MAX = 4;

/**
 * Per-position defaults for show_label / show_icon, used when an `info` entry
 * does not set them. Narrow positions drop the label (it stays in the tooltip);
 * the positions drawn on or beside the tank drop the icon.
 * In the compact layout `inside` and `left` drop the label as well.
 */
const INFO_DEFAULTS = {
  top:     { label: false, icon: true  },
  inside:  { label: true,  icon: false },
  between: { label: true,  icon: true  },
  bottom:  { label: true,  icon: true  },
  left:    { label: true,  icon: false },
};

/** Card defaults, shared by the card and the editor. */
const CONFIG_DEFAULTS = {
  min_temp: 20, max_temp: 80, layout: "normal", show_labels: true,
  icon: "", icon_mode: "beside",
  show_chart: false, chart_hours: 24, chart_position: "below",
  chart_style: "area",
  info_position: "top",
};

/** Fixed series colors for the chart (independent of temperature ramp). */
const CHART_COLORS = ["#e53935", "#fb8c00", "#1565c0", "#00897b"];

/** Evenly distributed vertical offsets (0 = top, 1 = bottom) for n values. */
function evenOffsets(n) {
  if (n <= 1) return [0.5];
  if (n === 2) return [0.3, 0.7];
  if (n === 3) return [0.12, 0.5, 0.88];
  return [0.08, 0.36, 0.64, 0.92]; // n === 4
}

const fireEvent = (node, type, detail = {}) => {
  const event = new Event(type, { bubbles: true, composed: true, cancelable: false });
  event.detail = detail;
  node.dispatchEvent(event);
};

function lerpColor(a, b, t) {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ar = ah >> 16, ag = (ah >> 8) & 255, ab = ah & 255;
  const br = bh >> 16, bg = (bh >> 8) & 255, bb = bh & 255;
  return `rgb(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)})`;
}

const TEMP_RAMP = [
  [0.0, "#1565c0"], [0.3, "#29b6f6"], [0.55, "#ffca28"],
  [0.78, "#fb8c00"], [1.0, "#e53935"],
];

function tempColor(t, min, max) {
  if (t === null || isNaN(t)) return "#9e9e9e";
  let f = Math.max(0, Math.min(1, (t - min) / (max - min)));
  for (let i = 1; i < TEMP_RAMP.length; i++) {
    const [p0, c0] = TEMP_RAMP[i - 1], [p1, c1] = TEMP_RAMP[i];
    if (f <= p1) return lerpColor(c0, c1, (f - p0) / (p1 - p0));
  }
  return TEMP_RAMP[TEMP_RAMP.length - 1][1];
}

/* -------------------------------------------------------------------------- */
/*  History API                                                               */
/* -------------------------------------------------------------------------- */

const HOUR_OPTIONS = [2, 6, 12, 24, 48];

/**
 * Fetch history for several entities in a single call via the WebSocket
 * history API (`history/history_during_period`).
 *
 * hass.callWS rides the frontend's already-authenticated WebSocket, so no
 * access token is involved. The previous implementation used a raw fetch()
 * against the REST API with hass.auth.data.access_token, which is never
 * refreshed on a dashboard that just stays open (wall tablets, kiosks): after
 * 30 minutes every poll failed with a 401 and was logged by HA as an invalid
 * login attempt.
 *
 * Returns a Map<entityId, Array<{ t: Date, v: number }>> sorted ascending.
 * Rejects if the WebSocket call fails, so the caller can keep the data it has.
 */
async function fetchHistory(hass, entityIds, hours) {
  const end   = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  const result = await hass.callWS({
    type: "history/history_during_period",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    entity_ids: entityIds,
    minimal_response: true,
    no_attributes: true,
  });
  // Compressed state format: s = state, lu = last_updated (epoch seconds),
  // lc = last_changed (epoch seconds), present only when it differs from lu.
  const map = new Map();
  for (const entityId of entityIds) {
    const states = result?.[entityId] || [];
    map.set(entityId, states
      .filter((s) => s.s !== "unavailable" && s.s !== "unknown")
      .map((s) => ({ t: new Date((s.lc ?? s.lu) * 1000), v: Number(s.s) }))
      .filter((p) => !isNaN(p.v)));
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/*  SVG chart renderer                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Build a smooth SVG path (Catmull-Rom converted to cubic Béziers) and an
 * optional area fill from a series of {t,v} points mapped into a
 * [x0,y0,w,h] box, given the global time and value extents.
 * Falls back to a straight polyline for fewer than 3 points.
 */
function buildPath(series, tMin, tMax, vMin, vMax, x0, y0, w, h) {
  if (series.length < 2) return { line: "", area: "" };
  const px = (t) => x0 + ((t - tMin) / (tMax - tMin)) * w;
  const py = (v) => y0 + h - ((v - vMin) / (vMax - vMin)) * h;
  const pts = series.map((s) => [px(s.t), py(s.v)]);

  let line;
  if (pts.length < 3) {
    line = `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}`;
  } else {
    // Catmull-Rom -> cubic Bézier conversion (uniform, tension 1).
    line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      line += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
  }

  const lastPt = pts[pts.length - 1];
  const area = `${line}L${lastPt[0].toFixed(1)},${(y0 + h).toFixed(1)}` +
               `L${x0.toFixed(1)},${(y0 + h).toFixed(1)}Z`;
  return { line, area };
}

/**
 * Render an SVG history chart for multiple series.
 * compact=true → shorter height, no Y axis labels, no legend (legend is the
 * tank badges themselves in compact mode).
 */
/**
 * Downsample a time series by averaging points into a fixed number of equal
 * time bins. This smooths out noisy raw history data before drawing the
 * curve, similar to what other history-graph cards do, instead of
 * interpolating every single recorded state change.
 */
function downsample(series, tMin, tMax, targetPoints) {
  if (series.length <= targetPoints) return series;
  const span = tMax - tMin || 1;
  const binMs = span / targetPoints;
  const bins = new Array(targetPoints).fill(null).map(() => []);
  for (const p of series) {
    let idx = Math.floor((p.t - tMin) / binMs);
    if (idx < 0) idx = 0;
    if (idx >= targetPoints) idx = targetPoints - 1;
    bins[idx].push(p.v);
  }
  const out = [];
  bins.forEach((vals, i) => {
    if (vals.length === 0) return;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    out.push({ t: tMin + (i + 0.5) * binMs, v: avg });
  });
  return out;
}

function renderChart(seriesList, labels, colors, style, compact) {
  const W = 380, H = compact ? 70 : 120;
  const PAD = { top: 8, right: 8, bottom: compact ? 6 : 20, left: compact ? 6 : 36 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const x0 = PAD.left, y0 = PAD.top;

  // Global time extents
  const allPts = seriesList.flat();
  if (allPts.length === 0) return svg`<svg viewBox="0 0 ${W} ${H}" width="100%"></svg>`;
  const tMin = Math.min(...allPts.map((p) => p.t));
  const tMax = Math.max(...allPts.map((p) => p.t));

  // Downsample each series to roughly one point per 4px of chart width,
  // which keeps the curve responsive but visually calm regardless of how
  // many raw state-changes the History API returned.
  const targetPoints = Math.max(20, Math.round(cW / 4));
  const smoothed = seriesList.map((series) =>
    downsample(
      series.map((s) => ({ t: s.t.getTime(), v: s.v })),
      tMin, tMax, targetPoints
    )
  );

  // Global value extents with a small padding
  const allV = smoothed.flat().map((p) => p.v);
  let vMin = Math.min(...allV), vMax = Math.max(...allV);
  const vPad = (vMax - vMin) * 0.1 || 2;
  vMin -= vPad; vMax += vPad;

  // Y-axis labels (4 ticks, only in non-compact mode)
  const yTicks = !compact
    ? [0, 0.33, 0.66, 1].map((f) => {
        const v = vMin + f * (vMax - vMin);
        const cy = y0 + cH - f * cH;
        return svg`
          <line x1="${x0}" y1="${cy.toFixed(1)}" x2="${(x0 + cW).toFixed(1)}" y2="${cy.toFixed(1)}"
                stroke="var(--divider-color,#e0e0e0)" stroke-width="1"></line>
          <text x="${(x0 - 4).toFixed(1)}" y="${(cy + 4).toFixed(1)}"
                text-anchor="end" class="chart-tick">${Math.round(v)}</text>`;
      })
    : [];

  // Series paths
  const paths = smoothed.map((series, i) => {
    if (series.length < 2) return "";
    const { line, area } = buildPath(series, tMin, tMax, vMin, vMax, x0, y0, cW, cH);
    const col = colors[i];
    return svg`
      ${style === "area"
        ? svg`<path d="${area}" fill="${col}" fill-opacity="0.12" stroke="none"></path>`
        : ""}
      <path d="${line}" fill="none" stroke="${col}" stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round"></path>`;
  });

  return svg`
    <svg viewBox="0 0 ${W} ${H}" width="100%" class="chart-svg">
      <rect width="${W}" height="${H}" fill="transparent"></rect>
      ${yTicks}
      ${paths}
    </svg>`;
}

/* -------------------------------------------------------------------------- */
/*  Card                                                                      */
/* -------------------------------------------------------------------------- */

class PufferCard extends LitElement {
  static get properties() {
    return {
      hass:        { attribute: false },
      _config:     { state: true },
      _history:    { state: true }, // Map<entityId, [{t,v}]>
      // _histLoading is NOT a reactive property: we manage re-renders manually
      // so that periodic silent refreshes never cause a visible blank flash.
    };
  }

  static getConfigElement() {
    return document.createElement("puffer-card-editor");
  }

  static async getStubConfig(hass) {
    const temps = hass
      ? Object.keys(hass.states).filter(
          (e) => e.startsWith("sensor.") &&
                 hass.states[e].attributes.device_class === "temperature"
        )
      : [];
    return {
      type: "custom:puffer-card",
      name: localize(hass, "default_title"),
      icon: "mdi:propane-tank-outline",
      icon_mode: "beside",
      layout: "normal",
      show_labels: true,
      min_temp: 20,
      max_temp: 80,
      top:    { entity: temps[0] || "", label: localize(hass, "label_top")    },
      middle: { entity: temps[1] || "", label: localize(hass, "label_middle") },
      extra:  { entity: temps[3] || "", label: localize(hass, "label_extra")  },
      bottom: { entity: temps[2] || "", label: localize(hass, "label_bottom") },
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    const prev = this._config;
    const merged = { ...CONFIG_DEFAULTS, ...config };
    // Always materialize chart_sensors explicitly (instead of relying on a
    // runtime fallback) so the multi-select in the editor and the chart
    // rendering never disagree about which sensors are selected.
    if (!Array.isArray(merged.chart_sensors) || merged.chart_sensors.length === 0) {
      merged.chart_sensors = POSITIONS
        .map((p) => p.key)
        .filter((k) => merged[k]?.entity);
    }
    this._config = merged;
    // If chart-relevant options changed while the card is already mounted,
    // reset the history cache and restart the polling interval so fresh data
    // is fetched immediately with the new settings.
    const chartParamsChanged = prev && this._config.show_chart && (
      prev.show_chart     !== this._config.show_chart     ||
      prev.chart_hours    !== this._config.chart_hours    ||
      prev.top?.entity    !== this._config.top?.entity    ||
      prev.middle?.entity !== this._config.middle?.entity ||
      prev.extra?.entity  !== this._config.extra?.entity  ||
      prev.bottom?.entity !== this._config.bottom?.entity ||
      JSON.stringify(prev.chart_sensors) !== JSON.stringify(this._config.chart_sensors)
    );
    if (chartParamsChanged) {
      this._history = new Map();
      if (this.isConnected) this._startPolling();
    }
  }

  getCardSize() {
    let size = this._config?.layout === "compact" ? 2 : 5;
    if (this._config?.show_chart) size += 2;
    const pos = this._infoPos();
    if ((pos === "between" || pos === "bottom") && this._infoItems(false).length) size += 1;
    return size;
  }

  /* ---- history ---------------------------------------------------------- */

  /**
   * Fetch history for all configured sensors.
   * Guards against concurrent calls (_fetching flag) and catches any network
   * or API errors so _histLoading never gets stuck at true.
   */
  async _fetchHistory() {
    if (!this.hass || !this._config?.show_chart) return;
    if (this._fetching) return; // prevent parallel calls
    this._fetching = true;
    // Show the loading placeholder only on the very first fetch (no data yet).
    const firstLoad = !this._history?.size;
    if (firstLoad) {
      this._histLoading = true;
      this.requestUpdate();
    }
    try {
      const hours   = Number(this._config.chart_hours) || 24;
      const data    = this._data();
      const wanted  = this._config.chart_sensors || POSITIONS.map((p) => p.key);
      const toFetch = data.filter((p) => wanted.includes(p.key) && p.cfg?.entity);
      // One request for all sensors; the same entity may sit at two positions.
      const entityIds = [...new Set(toFetch.map((p) => p.cfg.entity))];
      const byEntity  = entityIds.length
        ? await fetchHistory(this.hass, entityIds, hours)
        : new Map();
      const map = new Map();
      toFetch.forEach((p) => map.set(p.key, byEntity.get(p.cfg.entity) || []));
      // Assign the new history and trigger a single re-render.
      this._history = map;
      this.requestUpdate();
    } catch (err) {
      console.warn("[puffer-card] history fetch failed:", err);
    } finally {
      this._histLoading = false;
      this._fetching = false;
    }
  }

  /** Start the 60-second polling interval when the card is attached to the DOM. */
  connectedCallback() {
    super.connectedCallback();
    if (this._config?.show_chart) this._startPolling();
  }

  /** Clear the polling interval when the card is removed from the DOM. */
  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopPolling();
  }

  _startPolling() {
    this._stopPolling(); // always clear any existing interval first
    this._fetchHistory();
    this._pollInterval = setInterval(() => this._fetchHistory(), 60_000);
  }

  _stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  /** Re-start polling when show_chart is toggled on; stop it when toggled off. */
  updated(changed) {
    if (!changed.has("_config")) return;
    const prev = changed.get("_config");
    if (this._config?.show_chart && !prev?.show_chart) {
      this._startPolling();
    } else if (!this._config?.show_chart && prev?.show_chart) {
      this._stopPolling();
    }
  }

  /* ---- data ------------------------------------------------------------- */

  _stateOf(cfg) {
    if (!cfg || !cfg.entity || !this.hass) return null;
    return this.hass.states[cfg.entity] || null;
  }

  _data() {
    const present = POSITIONS.map((p) => {
      const cfg = this._config[p.key];
      if (!cfg || !cfg.entity) return null;
      const st        = this._stateOf(cfg);
      const raw       = st ? Number(st.state) : NaN;
      const available = st && st.state !== "unavailable" && st.state !== "unknown";
      const unit      = (st?.attributes?.unit_of_measurement) || this._config.unit || "°C";
      const label     = (cfg.label && cfg.label.toString()) || localize(this.hass, p.labelKey);
      return { ...p, cfg, unit, label, available, temp: available && !isNaN(raw) ? raw : null };
    }).filter(Boolean);

    const offs = evenOffsets(present.length);
    return present.map((p, i) => ({ ...p, off: offs[i] }));
  }

  _format(t) {
    const r = Math.round(t * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    fireEvent(this, "hass-more-info", { entityId });
  }

  /* ---- extra values (info) ---------------------------------------------- */

  _infoPos() {
    const p = this._config?.info_position;
    return INFO_POSITIONS.includes(p) ? p : INFO_POSITIONS[0];
  }

  /**
   * Formatted state split into value and unit, so the unit can be styled
   * smaller. Uses Home Assistant's own formatter when available: numbers
   * follow the user's locale, and states such as "on" are translated.
   */
  _infoValue(st) {
    if (!st) return { val: "—", unit: "" };
    const unit = st.attributes?.unit_of_measurement || "";
    const full = typeof this.hass?.formatEntityState === "function"
      ? this.hass.formatEntityState(st)
      : `${st.state}${unit ? ` ${unit}` : ""}`;
    if (unit && full.endsWith(unit)) return { val: full.slice(0, -unit.length).trim(), unit };
    return { val: full, unit: "" };
  }

  /**
   * Resolved `info` entries: at most INFO_MAX, entries without an entity are
   * skipped, and inside the compact tank only the first one fits.
   */
  _infoItems(compact) {
    const pos  = this._infoPos();
    const defs = INFO_DEFAULTS[pos];
    const narrow = compact && (pos === "inside" || pos === "left");
    let list = Array.isArray(this._config?.info)
      ? this._config.info.filter((i) => i && i.entity).slice(0, INFO_MAX)
      : [];
    if (compact && pos === "inside") list = list.slice(0, 1);
    return list.map((i) => {
      const st = this.hass?.states?.[i.entity] || null;
      const { val, unit } = this._infoValue(st);
      return {
        entity: i.entity,
        stateObj: st,
        label: (i.label && i.label.toString()) || st?.attributes?.friendly_name || i.entity,
        icon: i.icon || st?.attributes?.icon || "",
        val, unit,
        showLabel: typeof i.show_label === "boolean" ? i.show_label : (narrow ? false : defs.label),
        showIcon:  typeof i.show_icon  === "boolean" ? i.show_icon  : defs.icon,
      };
    });
  }

  /**
   * Gap centres (0..1 offsets) between the configured sensors, ordered top to
   * bottom, so values drawn on the tank avoid the sensor lines. Falls back to
   * even spacing when there are more values than gaps.
   */
  _infoOffsets(data, n) {
    const offs = [0, ...data.map((p) => p.off).sort((a, b) => a - b), 1];
    const gaps = [];
    for (let i = 0; i < offs.length - 1; i++) {
      gaps.push({ c: (offs[i] + offs[i + 1]) / 2, w: offs[i + 1] - offs[i] });
    }
    if (n > gaps.length) return Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
    return gaps.sort((a, b) => b.w - a.w).slice(0, n).map((g) => g.c).sort((a, b) => a - b);
  }

  _gradient(data, min, max) {
    let stops = data
      .filter((p) => p.temp !== null)
      .map((p) => ({ off: p.off, color: tempColor(p.temp, min, max) }))
      .sort((a, b) => a.off - b.off);
    if (stops.length === 0) {
      stops = [{ off: 0, color: "#1565c0" }, { off: 1, color: "#e53935" }];
    } else {
      if (stops[0].off > 0) stops = [{ off: 0, color: stops[0].color }, ...stops];
      const last = stops[stops.length - 1];
      if (last.off < 1) stops = [...stops, { off: 1, color: last.color }];
    }
    return { stops, bottomColor: stops[stops.length - 1].color };
  }

  /* ---- chart ------------------------------------------------------------ */

  /**
   * Whether to use fixed chart colors for the dots instead of temp-ramp colors.
   * Activates only when the chart is shown and more than one series is displayed.
   */
  _useChartColors(data) {
    if (!this._config.show_chart) return false;
    const wanted  = this._config.chart_sensors || POSITIONS.map((p) => p.key);
    const visible = data.filter((p) => wanted.includes(p.key));
    return visible.length > 1;
  }

  _dotColor(p, data, min, max) {
    if (this._useChartColors(data)) {
      const wanted = this._config.chart_sensors || POSITIONS.map((p) => p.key);
      const idx    = data.filter((d) => wanted.includes(d.key)).findIndex((d) => d.key === p.key);
      return idx >= 0 ? CHART_COLORS[idx % CHART_COLORS.length] : tempColor(p.temp, min, max);
    }
    return tempColor(p.temp, min, max);
  }

  _renderChart(data, compact = false) {
    const wanted   = this._config.chart_sensors || POSITIONS.map((p) => p.key);
    const series   = data.filter((p) => wanted.includes(p.key));
    const colors   = series.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
    const labels   = series.map((p) => p.label);
    const history  = series.map((p) => (this._history?.get(p.key) || []));
    const style    = this._config.chart_style || "area";
    return html`
      <div class="chart-wrap ${compact ? "chart-compact" : ""}">
        ${this._histLoading && !this._history?.size
          ? html`<div class="chart-loading">…</div>`
          : renderChart(history, labels, colors, style, compact)}
      </div>`;
  }

  /* ---- render: shared defs --------------------------------------------- */

  _defs(stops, gradId) {
    return svg`
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          ${stops.map((s) => svg`<stop offset="${s.off * 100}%" stop-color="${s.color}"></stop>`)}
        </linearGradient>
        <linearGradient id="lidGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#cfd8dc"></stop>
          <stop offset="50%" stop-color="#eceff1"></stop>
          <stop offset="100%" stop-color="#b0bec5"></stop>
        </linearGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(255,255,255,0.40)"></stop>
          <stop offset="35%" stop-color="rgba(255,255,255,0.06)"></stop>
          <stop offset="100%" stop-color="rgba(0,0,0,0.14)"></stop>
        </linearGradient>
        <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4"
                        flood-color="rgba(0,0,0,0.25)"></feDropShadow>
        </filter>
      </defs>`;
  }

  /* ---- render: extra values -------------------------------------------- */

  _infoIcon(it) {
    if (it.icon) return html`<ha-icon class="info-icon" .icon=${it.icon}></ha-icon>`;
    // No explicit icon: let Home Assistant pick the domain / device-class icon.
    if (it.stateObj && customElements.get("ha-state-icon")) {
      return html`<ha-state-icon class="info-icon" .hass=${this.hass} .stateObj=${it.stateObj}></ha-state-icon>`;
    }
    return "";
  }

  _chip(it, cls = "") {
    return html`
      <div class="chip ${cls}" title=${it.label} @click=${() => this._moreInfo(it.entity)}>
        ${it.showIcon ? this._infoIcon(it) : ""}
        ${it.showLabel ? html`<span class="chip-label">${it.label}</span>` : ""}
        <span class="chip-val">${it.val}${it.unit ? html`<span class="chip-unit">${it.unit}</span>` : ""}</span>
      </div>`;
  }

  _chips(items, cls = "") {
    if (!items.length) return "";
    return html`<div class="info-chips ${cls}">${items.map((it) => this._chip(it))}</div>`;
  }

  /**
   * HTML layer laid exactly over an SVG drawn with `preserveAspectRatio meet`:
   * it takes the SVG's aspect ratio and full height, so percentages map to
   * viewBox coordinates whether the SVG is limited by its width or by its
   * max-height. HTML instead of SVG text gives real text measurement, icons,
   * and the same chip styling as the other positions.
   */
  _overlay(vbW, vbH, children) {
    return html`<div class="overlay" style="aspect-ratio:${vbW} / ${vbH}">${children}</div>`;
  }

  _at(xPct, yPct, content) {
    return html`<div class="at" style="left:${xPct}%;top:${yPct}%">${content}</div>`;
  }

  _vstack(items) {
    return html`<div class="vstack">${items.map((it) => this._chip(it, "vertical"))}</div>`;
  }

  /* ---- render: normal layout ------------------------------------------- */

  /**
   * Geometry/typography metrics for the normal-layout tank, based on how
   * many sensors are configured. 1-3 sensors keep the exact original
   * pixel layout (full backward compatibility for existing installs);
   * 4 sensors get a taller tank and smaller badge fonts so nothing overlaps.
   */
  _metrics(n) {
    const quad     = n === 4;
    const liquidTop = 48;
    const liquidH   = quad ? 252 : 204;
    const liquidBot = liquidTop + liquidH;
    const viewH     = quad ? 360 : 300;
    return quad
      ? {
          quad, liquidTop, liquidH, liquidBot, viewH,
          badgeRectYOff: 22, dotCyLabelOff: 8, labelYOff: 4,
          valueYOffLabel: 14, valueYOffNoLabel: 7,
          fontLabel: 9, fontValue: 17, fontUnit: 10, unitDx: 2,
        }
      : {
          quad, liquidTop, liquidH, liquidBot, viewH,
          badgeRectYOff: 25, dotCyLabelOff: 9, labelYOff: 5,
          valueYOffLabel: 16, valueYOffNoLabel: 8,
          fontLabel: 10, fontValue: 21, fontUnit: 11, unitDx: 3,
        };
  }

  _y(off, m) {
    return m.liquidTop + off * m.liquidH;
  }

  _badge(p, min, max, showLabels, dotColor, m) {
    const y      = this._y(p.off, m);
    const val    = p.temp === null ? "—" : this._format(p.temp);
    const dotCy  = showLabels ? y - m.dotCyLabelOff : y;
    const valueY = showLabels ? y + m.valueYOffLabel : y + m.valueYOffNoLabel;
    return svg`
      <g class="badge" @click=${() => this._moreInfo(p.cfg.entity)}>
        <line x1="46" y1="${y}" x2="174" y2="${y}"
              stroke="rgba(255,255,255,0.55)" stroke-width="1.5"
              stroke-dasharray="4 4"></line>
        <line x1="180" y1="${y}" x2="212" y2="${y}"
              stroke="var(--divider-color, #cfd8dc)" stroke-width="2"></line>
        <circle cx="180" cy="${y}" r="4.5" fill="${dotColor}"></circle>
        <rect x="212" y="${y - m.badgeRectYOff}" width="156" height="${m.badgeRectYOff * 2}" rx="13"
              fill="var(--card-background-color, #fff)"
              stroke="var(--divider-color, #cfd8dc)" stroke-width="1"></rect>
        <circle cx="226" cy="${dotCy}" r="4" fill="${dotColor}"></circle>
        ${showLabels
          ? svg`<text x="237" y="${y - m.labelYOff}" class="lbl" style="font-size:${m.fontLabel}px">${p.label}</text>`
          : ""}
        <text x="${showLabels ? 226 : 240}" y="${valueY}" class="val" style="font-size:${m.fontValue}px"
              fill="${tempColor(p.temp, min, max)}">${val}<tspan class="unit" dx="${m.unitDx}" style="font-size:${m.fontUnit}px">${p.unit}</tspan></text>
      </g>`;
  }

  _renderNormal(data, min, max, showLabels, items) {
    const { stops, bottomColor } = this._gradient(data, min, max);
    const useChart   = this._config.show_chart;
    const chartAbove = this._config.chart_position === "above";
    const m = this._metrics(data.length);
    // One side pipe per configured sensor, centered on its height, instead
    // of a fixed pair of decorative pipes unrelated to how many sensors exist.
    const sidePipes = data.map((p) => {
      const yy = this._y(p.off, m);
      return svg`<rect x="176" y="${yy - 5.5}" width="34" height="11" rx="3" fill="#9fb0b8"></rect>`;
    });
    // Insulation bands are purely decorative; keep them proportionally
    // placed at ~35% / ~65% of the liquid area regardless of tank height.
    const bandY1 = m.liquidTop + m.liquidH * 0.35;
    const bandY2 = m.liquidTop + m.liquidH * 0.65;
    const tank = html`
      <svg viewBox="0 0 380 ${m.viewH}" width="100%" preserveAspectRatio="xMidYMid meet">
        ${this._defs(stops, "liquidGrad")}
        <rect x="101" y="18" width="18" height="34" rx="3" fill="#9fb0b8"></rect>
        <rect x="101" y="${m.liquidBot}" width="18" height="28" rx="3" fill="#9fb0b8"></rect>
        ${sidePipes}
        <g filter="url(#ds)">
          <ellipse cx="110" cy="${m.liquidBot}" rx="70" ry="15" fill="${bottomColor}"></ellipse>
          <rect x="40" y="${m.liquidTop}" width="140" height="${m.liquidH}" fill="url(#liquidGrad)"></rect>
          <rect x="40" y="${m.liquidTop}" width="140" height="${m.liquidH}" fill="url(#sheen)"></rect>
          <path d="M40,${m.liquidBot} A70,15 0 0 0 180,${m.liquidBot}"
                fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="2"></path>
          <line x1="40"  y1="${m.liquidTop}" x2="40"  y2="${m.liquidBot}" stroke="rgba(0,0,0,0.18)" stroke-width="2"></line>
          <line x1="180" y1="${m.liquidTop}" x2="180" y2="${m.liquidBot}" stroke="rgba(0,0,0,0.18)" stroke-width="2"></line>
          <line x1="42" y1="${bandY1}" x2="178" y2="${bandY1}" stroke="rgba(255,255,255,0.18)" stroke-width="3"></line>
          <line x1="42" y1="${bandY2}" x2="178" y2="${bandY2}" stroke="rgba(255,255,255,0.18)" stroke-width="3"></line>
          <ellipse cx="110" cy="${m.liquidTop}" rx="70" ry="15" fill="url(#lidGrad)"
                   stroke="rgba(0,0,0,0.18)" stroke-width="1.5"></ellipse>
        </g>
        ${data.map((p) => this._badge(p, min, max, showLabels, this._dotColor(p, data, min, max), m))}
      </svg>`;

    const pos = this._infoPos();
    let overlay = "";
    if (items.length && pos === "inside") {
      // Centred on the tank body, in the gaps between the sensor lines.
      const offs = this._infoOffsets(data, items.length);
      overlay = items.map((it, i) => this._at(
        (110 / 380) * 100,
        ((m.liquidTop + offs[i] * m.liquidH) / m.viewH) * 100,
        this._chip(it, "on-tank"),
      ));
    } else if (items.length && pos === "left") {
      // The free strip left of the tank (viewBox x 0..40), centred on the liquid.
      overlay = this._at(
        (18 / 380) * 100,
        ((m.liquidTop + m.liquidH / 2) / m.viewH) * 100,
        this._vstack(items),
      );
    }
    const tankBox = overlay
      ? html`<div class="tank-wrap">${tank}${this._overlay(380, m.viewH, overlay)}</div>`
      : tank;
    const between = pos === "between" && useChart ? this._chips(items, "between") : "";

    return html`
      ${useChart && chartAbove  ? this._renderChart(data, false) : ""}
      ${useChart && chartAbove  ? between : ""}
      ${tankBox}
      ${useChart && !chartAbove ? between : ""}
      ${useChart && !chartAbove ? this._renderChart(data, false) : ""}`;
  }

  /* ---- render: compact layout ------------------------------------------ */

  _miniTank(data, min, max) {
    const { stops, bottomColor } = this._gradient(data, min, max);
    const y = (off) => 14 + off * 96;
    return svg`
      <svg viewBox="0 0 84 124" width="64" preserveAspectRatio="xMidYMid meet">
        ${this._defs(stops, "liquidGrad")}
        <g filter="url(#ds)">
          <ellipse cx="42" cy="110" rx="26" ry="7" fill="${bottomColor}"></ellipse>
          <rect x="16" y="14" width="52" height="96" fill="url(#liquidGrad)"></rect>
          <rect x="16" y="14" width="52" height="96" fill="url(#sheen)"></rect>
          <line x1="16" y1="14"  x2="16" y2="110" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"></line>
          <line x1="68" y1="14"  x2="68" y2="110" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"></line>
          <path d="M16,110 A26,7 0 0 0 68,110"
                fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.5"></path>
          <ellipse cx="42" cy="14" rx="26" ry="7" fill="url(#lidGrad)"
                   stroke="rgba(0,0,0,0.18)" stroke-width="1"></ellipse>
        </g>
        ${data.map((p) => svg`
          <circle cx="68" cy="${y(p.off)}" r="3.5"
                  fill="${this._dotColor(p, data, min, max)}"
                  stroke="#fff" stroke-width="1"></circle>`)}
      </svg>`;
  }

  _renderCompact(data, min, max, showLabels, items) {
    const useChart   = this._config.show_chart;
    const chartAbove = this._config.chart_position === "above";
    const quad       = data.length === 4;
    const pos        = this._infoPos();
    // Mini tank: viewBox 84 x 124, liquid from y 14 to y 110.
    const inside = items.length && pos === "inside"
      ? this._overlay(84, 124, this._at(50, ((14 + this._infoOffsets(data, 1)[0] * 96) / 124) * 100,
          this._chip(items[0], "on-tank small")))
      : "";
    const body = html`
      <div class="compact ${quad ? "is-quad" : ""}">
        ${items.length && pos === "left" ? this._vstack(items) : ""}
        <div class="mini">${this._miniTank(data, min, max)}${inside}</div>
        <div class="rows">
          ${data.map((p) => {
            const color = tempColor(p.temp, min, max);
            const dot   = this._dotColor(p, data, min, max);
            const val   = p.temp === null ? "—" : this._format(p.temp);
            return html`
              <div class="row ${showLabels ? "" : "no-labels"}"
                   @click=${() => this._moreInfo(p.cfg.entity)}>
                ${showLabels
                  ? html`<span class="dot" style="background:${dot}"></span>
                         <span class="rlabel">${p.label}</span>`
                  : ""}
                <span class="rval" style="color:${color}">${val}<span class="runit">${p.unit}</span></span>
              </div>`;
          })}
        </div>
      </div>`;
    const between = pos === "between" && useChart ? this._chips(items, "between small") : "";
    return html`
      ${useChart && chartAbove  ? this._renderChart(data, true) : ""}
      ${useChart && chartAbove  ? between : ""}
      ${body}
      ${useChart && !chartAbove ? between : ""}
      ${useChart && !chartAbove ? this._renderChart(data, true) : ""}`;
  }

  /* ---- render ----------------------------------------------------------- */

  render() {
    if (!this._config) return html``;

    const min        = Number(this._config.min_temp);
    const max        = Number(this._config.max_temp) > min ? Number(this._config.max_temp) : min + 1;
    const data       = this._data();
    const compact    = this._config.layout === "compact";
    const showLabels = this._config.show_labels !== false;

    const hasIcon  = !!this._config.icon;
    const replaceTitle = hasIcon && this._config.icon_mode === "replace";

    const pos   = this._infoPos();
    const items = this._infoItems(compact);
    const topChips = pos === "top" && items.length
      ? this._chips(items, `in-title${compact ? " small" : ""}`)
      : "";
    const atBottom = items.length &&
      (pos === "bottom" || (pos === "between" && !this._config.show_chart));
    const name = replaceTitle ? "" : this._config.name;

    return html`
      <ha-card class=${compact ? "is-compact" : ""}>
        ${this._config.name || hasIcon || topChips
          ? html`
              <div class="title ${topChips ? "has-info" : ""}">
                ${hasIcon ? html`<ha-icon class="title-icon" icon=${this._config.icon}></ha-icon>` : ""}
                ${topChips ? html`<span class="title-name">${name}</span>${topChips}` : name}
              </div>`
          : ""}
        <div class="container">
          ${compact
            ? this._renderCompact(data, min, max, showLabels, items)
            : this._renderNormal(data, min, max, showLabels, items)}
        </div>
        ${atBottom ? this._chips(items, `bottom${compact ? " small" : ""}`) : ""}
      </ha-card>`;
  }

  static get styles() {
    return css`
      ha-card { padding: 12px 12px 8px; overflow: hidden; }
      ha-card.is-compact { padding: 10px 14px; }
      .title { display: flex; align-items: center; gap: 8px; font-size: 1.15rem; font-weight: 600;
               color: var(--primary-text-color); padding: 4px 4px 0; }
      .is-compact .title { font-size: 1rem; padding: 0 0 6px; }
      .title-icon { --mdc-icon-size: 22px; color: var(--state-icon-color, var(--primary-text-color)); flex: 0 0 auto; }
      .container { width: 100%; }
      svg { display: block; max-height: 360px; }
      /* normal badges */
      .badge { cursor: pointer; }
      .badge:hover rect { stroke: var(--primary-color); }
      .lbl { fill: var(--secondary-text-color, #727272); font-size: 10px; font-weight: 700;
             letter-spacing: 0.5px; text-transform: uppercase;
             font-family: var(--paper-font-body1_-_font-family, sans-serif); }
      .val  { font-size: 21px; font-weight: 700;
              font-family: var(--paper-font-body1_-_font-family, sans-serif); }
      .unit { font-size: 11px; font-weight: 600; }
      /* compact */
      .compact { display: flex; align-items: center; gap: 14px; }
      .compact .mini { flex: 0 0 auto; }
      .compact .mini svg { max-height: 124px; }
      .rows { flex: 1 1 auto; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .row  { display: flex; align-items: center; gap: 8px; cursor: pointer;
              padding: 4px 6px; border-radius: 8px; }
      .row:hover { background: var(--secondary-background-color, rgba(0,0,0,0.05)); }
      .dot  { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; }
      .rlabel { flex: 1 1 auto; color: var(--primary-text-color); font-size: 0.95rem;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rval { flex: 0 0 auto; margin-left: auto; font-weight: 700; font-size: 1.15rem; }
      .row.no-labels .rval { margin-left: 0; }
      .runit { font-size: 0.75rem; font-weight: 600; margin-left: 2px; }
      /* 4-sensor compact mode: slightly smaller text so 4 rows stay comfortable */
      .compact.is-quad .rows { gap: 3px; }
      .compact.is-quad .rlabel { font-size: 0.85rem; }
      .compact.is-quad .rval { font-size: 1rem; }
      .compact.is-quad .runit { font-size: 0.68rem; }
      .compact.is-quad .dot { width: 9px; height: 9px; }
      /* extra values (info) */
      .title.has-info .title-name { flex: 0 1 auto; min-width: 0; white-space: nowrap;
                                    overflow: hidden; text-overflow: ellipsis; }
      .info-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
      .info-chips.in-title { flex: 0 0 auto; flex-wrap: nowrap; margin-left: auto; font-weight: 400; }
      .info-chips.between { padding: 2px 4px 0; }
      .info-chips.bottom { padding: 6px 4px 4px; }
      .chip { display: flex; align-items: center; gap: 5px; cursor: pointer; line-height: 1.2;
              padding: 3px 10px 3px 8px; border-radius: 14px; white-space: nowrap;
              background: var(--secondary-background-color, rgba(0,0,0,0.05));
              border: 1px solid var(--divider-color, rgba(0,0,0,0.12)); }
      .chip:hover { border-color: var(--primary-color); }
      .chip-label { color: var(--secondary-text-color, #727272); font-size: 0.78rem; font-weight: 600; }
      .chip-val { color: var(--primary-text-color); font-size: 0.9rem; font-weight: 700; }
      .chip-unit { font-size: 0.72em; font-weight: 600; margin-left: 2px; }
      .info-icon { --mdc-icon-size: 16px; display: inline-flex; flex: 0 0 auto;
                   color: var(--state-icon-color, var(--secondary-text-color)); }
      .small .chip, .chip.small { padding: 2px 8px 2px 6px; }
      .small .chip-label, .chip.small .chip-label { font-size: 0.72rem; }
      .small .chip-val, .chip.small .chip-val { font-size: 0.82rem; }
      .small .info-icon, .chip.small .info-icon { --mdc-icon-size: 14px; }
      /* on the tank body */
      .chip.on-tank { background: rgba(0,0,0,0.38); border-color: transparent; }
      .chip.on-tank .chip-val { color: #fff; }
      .chip.on-tank .chip-label, .chip.on-tank .info-icon { color: rgba(255,255,255,0.85); }
      .chip.on-tank.small { padding: 1px 5px; }
      /* rotated, reading bottom to top */
      .vstack { display: flex; flex-direction: column; justify-content: center; gap: 6px; }
      .compact .vstack { flex: 0 0 auto; }
      .chip.vertical { writing-mode: vertical-rl; transform: rotate(180deg); padding: 10px 3px; gap: 6px; }
      .chip.vertical .info-icon { transform: rotate(90deg); }
      .is-compact .chip.vertical { padding: 6px 2px; }
      .is-compact .chip.vertical .chip-label { font-size: 0.68rem; }
      .is-compact .chip.vertical .chip-val { font-size: 0.78rem; }
      /* HTML layer over the tank SVG, see _overlay() */
      .tank-wrap, .compact .mini { position: relative; }
      .overlay { position: absolute; top: 0; bottom: 0; left: 50%; height: 100%;
                 transform: translateX(-50%); pointer-events: none; }
      .at { position: absolute; transform: translate(-50%, -50%); pointer-events: auto; }
      /* chart */
      .chart-wrap { width: 100%; overflow: hidden; }
      .chart-wrap.chart-compact { margin: 4px 0; }
      .chart-wrap:not(.chart-compact) { margin: 8px 0; }
      .chart-svg { display: block; }
      .chart-tick { font-size: 9px; fill: var(--secondary-text-color, #727272);
                    font-family: var(--paper-font-body1_-_font-family, sans-serif); }
      .chart-loading { height: 70px; display: flex; align-items: center;
                       justify-content: center; color: var(--secondary-text-color); font-size: 0.85rem; }
    `;
  }
}

/* -------------------------------------------------------------------------- */
/*  Editor                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * The editor shows `info` as four fixed slots ("Extra value 1".."4"), the same
 * pattern as the four sensor positions, instead of relying on a list selector.
 * The YAML keeps a plain `info:` list; these two functions convert between the
 * two shapes. show_label / show_icon are tri-state in the editor (auto / show /
 * hide), because a boolean field cannot express "not set, use the default".
 */
const TRI_TO_EDITOR = (v) => (v === true ? "show" : v === false ? "hide" : "auto");
const TRI_FROM_EDITOR = { show: true, hide: false };

function infoToEditor(config) {
  const data = { ...config };
  delete data.info;
  const list = Array.isArray(config.info) ? config.info : [];
  for (let i = 0; i < INFO_MAX; i++) {
    const e = list[i] || {};
    data[`info_${i + 1}`] = {
      info_entity: e.entity || "",
      info_label:  e.label  || "",
      info_icon:   e.icon   || "",
      show_label:  TRI_TO_EDITOR(e.show_label),
      show_icon:   TRI_TO_EDITOR(e.show_icon),
    };
  }
  return data;
}

function infoFromEditor(value) {
  const config = { ...value };
  const info = [];
  for (let i = 1; i <= INFO_MAX; i++) {
    const s = config[`info_${i}`];
    delete config[`info_${i}`];
    if (!s) continue;
    const e = {};
    if (s.info_entity) e.entity = s.info_entity;
    if (s.info_label)  e.label  = s.info_label;
    if (s.info_icon)   e.icon   = s.info_icon;
    if (s.show_label in TRI_FROM_EDITOR) e.show_label = TRI_FROM_EDITOR[s.show_label];
    if (s.show_icon  in TRI_FROM_EDITOR) e.show_icon  = TRI_FROM_EDITOR[s.show_icon];
    // Keep a slot that is being filled in (label typed before the entity);
    // the card itself ignores entries without an entity.
    if (e.entity || e.label || e.icon) info.push(e);
  }
  if (info.length) config.info = info;
  else delete config.info;
  return config;
}

class PufferCardEditor extends LitElement {
  static get properties() {
    return { hass: { attribute: false }, _config: { state: true } };
  }

  setConfig(config) {
    // Mirror the same defaulting/materialization logic as PufferCard.setConfig
    // so the editor's schema (checkboxes, dropdowns) always reflects what the
    // card will actually render — these are two separate instances with two
    // separate config copies, so the same logic has to run in both places.
    const merged = { ...CONFIG_DEFAULTS, ...config };
    if (!Array.isArray(merged.chart_sensors) || merged.chart_sensors.length === 0) {
      merged.chart_sensors = POSITIONS
        .map((p) => p.key)
        .filter((k) => merged[k]?.entity);
    }
    this._config = merged;
  }

  _schema() {
    const sub = [
      { name: "entity", selector: { entity: { domain: ["sensor", "number", "input_number"] } } },
      { name: "label",  selector: { text: {} } },
    ];

    // Chart sensors: only show keys that have a configured entity
    const sensorOptions = POSITIONS
      .filter((p) => this._config?.[p.key]?.entity)
      .map((p) => ({
        value: p.key,
        label: this._config[p.key]?.label || localize(this.hass, p.labelKey),
      }));

    const chartSchema = this._config?.show_chart ? [
      {
        name: "chart_position",
        selector: { select: { mode: "dropdown", options: [
          { value: "below", label: localize(this.hass, "chart_below") },
          { value: "above", label: localize(this.hass, "chart_above") },
        ]}},
      },
      {
        name: "chart_hours",
        selector: { select: { mode: "dropdown", options:
          HOUR_OPTIONS.map((h) => ({ value: h, label: `${h}h` })),
        }},
      },
      {
        name: "chart_style",
        selector: { select: { mode: "dropdown", options: [
          { value: "area", label: localize(this.hass, "chart_style_area") },
          { value: "line", label: localize(this.hass, "chart_style_line") },
        ]}},
      },
      ...(sensorOptions.length > 1 ? [{
        name: "chart_sensors",
        selector: { select: { mode: "list", multiple: true, options: sensorOptions } },
      }] : []),
    ] : [];

    return [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      {
        name: "icon_mode",
        selector: { select: { mode: "dropdown", options: [
          { value: "beside",  label: localize(this.hass, "icon_mode_beside")  },
          { value: "replace", label: localize(this.hass, "icon_mode_replace") },
        ]}},
      },
      { name: "layout", selector: { select: { mode: "dropdown", options: [
        { value: "normal",  label: localize(this.hass, "layout_normal")  },
        { value: "compact", label: localize(this.hass, "layout_compact") },
      ]}}},
      { name: "show_labels", selector: { boolean: {} } },
      { type: "grid", schema: [
        { name: "min_temp", selector: { number: { mode: "box", step: 1, unit_of_measurement: "°C" } } },
        { name: "max_temp", selector: { number: { mode: "box", step: 1, unit_of_measurement: "°C" } } },
      ]},
      { name: "top",    type: "expandable", title: localize(this.hass, "pos_top"),    expanded: true, schema: sub },
      { name: "middle", type: "expandable", title: localize(this.hass, "pos_middle"), schema: sub },
      { name: "extra",  type: "expandable", title: localize(this.hass, "pos_extra"),  schema: sub },
      { name: "bottom", type: "expandable", title: localize(this.hass, "pos_bottom"), schema: sub },
      { name: "show_chart", selector: { boolean: {} } },
      ...chartSchema,
      ...this._infoSchema(),
    ];
  }

  _infoSchema() {
    const tri = [
      { value: "auto", label: localize(this.hass, "opt_auto") },
      { value: "show", label: localize(this.hass, "opt_show") },
      { value: "hide", label: localize(this.hass, "opt_hide") },
    ];
    const sub = [
      { name: "info_entity", selector: { entity: {} } },
      { name: "info_label",  selector: { text: {} } },
      { name: "info_icon",   selector: { icon: {} } },
      { type: "grid", schema: [
        { name: "show_label", selector: { select: { mode: "dropdown", options: tri } } },
        { name: "show_icon",  selector: { select: { mode: "dropdown", options: tri } } },
      ]},
    ];
    // Filled slots plus one empty slot to add the next value.
    const filled = Array.isArray(this._config?.info) ? this._config.info.length : 0;
    const slots  = Math.min(INFO_MAX, filled + 1);
    return [
      {
        name: "info_position",
        selector: { select: { mode: "dropdown", options:
          INFO_POSITIONS.map((p) => ({ value: p, label: localize(this.hass, `info_pos_${p}`) })),
        }},
      },
      ...Array.from({ length: slots }, (_, i) => ({
        name: `info_${i + 1}`,
        type: "expandable",
        title: `${localize(this.hass, "info_slot")} ${i + 1}`,
        schema: sub,
      })),
    ];
  }

  _computeLabel = (schema) => {
    // Keys that map directly to a translation entry.
    const FIELD_KEYS = new Set([
      "name", "icon", "icon_mode", "layout", "show_labels",
      "min_temp", "max_temp", "entity", "label",
      "show_chart", "chart_position", "chart_hours", "chart_style", "chart_sensors",
      "info_position", "info_entity", "info_label", "info_icon", "show_label", "show_icon",
    ]);
    if (FIELD_KEYS.has(schema.name)) return localize(this.hass, schema.name);
    // Expandable section titles are provided directly in the schema; fall through.
    return schema.title ?? schema.name;
  };

  _valueChanged(ev) {
    ev.stopPropagation();
    const config = infoFromEditor(ev.detail.value);
    if (!config.type) config.type = "custom:puffer-card";
    fireEvent(this, "config-changed", { config });
  }

  render() {
    if (!this._config || !this.hass) return html``;
    return html`
      <ha-form .hass=${this.hass} .data=${infoToEditor(this._config)} .schema=${this._schema()}
               .computeLabel=${this._computeLabel}
               @value-changed=${this._valueChanged}></ha-form>`;
  }
}

/* -------------------------------------------------------------------------- */
/*  Registration                                                              */
/* -------------------------------------------------------------------------- */

customElements.define("puffer-card", PufferCard);
customElements.define("puffer-card-editor", PufferCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "puffer-card",
  name: "Puffer Card",
  description: "Represents a buffer tank / boiler with 1-4 temperatures at different heights, plus optional extra values.",
  preview: true,
  documentationURL: "https://github.com/giorgioparri/puffer-card",
});

console.info(
  `%c PUFFER-CARD %c v${VERSION} `,
  "color:white;background:#1e88e5;font-weight:700;",
  "color:#1e88e5;background:white;font-weight:700;"
);
