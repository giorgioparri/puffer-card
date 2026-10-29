# Puffer Card

[![HACS Default](https://img.shields.io/badge/HACS-Default-orange.svg)](https://github.com/hacs/default)
[![GitHub Release](https://img.shields.io/github/release/giorgioparri/puffer-card.svg)](https://github.com/giorgioparri/puffer-card/releases)
[![Validate](https://github.com/giorgioparri/puffer-card/actions/workflows/validate.yml/badge.svg)](https://github.com/giorgioparri/puffer-card/actions/workflows/validate.yml)
[![License](https://img.shields.io/github/license/giorgioparri/puffer-card.svg)](https://github.com/giorgioparri/puffer-card/blob/main/LICENSE)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=giorgioparri&repository=puffer-card&category=plugin)

A custom [Home Assistant](https://www.home-assistant.io/) **Lovelace card** that
visually represents a **buffer tank / hot-water cylinder** (a "puffer") used for
heating and domestic hot water. It shows up to four temperatures at different
heights and colors the tank according to the real thermal stratification.
Extra values such as the system pressure or a pump state can sit alongside.

<img src="https://raw.githubusercontent.com/giorgioparri/puffer-card/v1.6.0-beta.1/images/standard.png" alt="Puffer Card – standard layout" width="420">

## Features

- Shows **1 to 4 temperatures**; with fewer than four values they are spread
  evenly over the tank height.
- **Color-coded stratification**: each level is colored from blue (cold) to red
  (hot), based on configurable `min`/`max` temperatures.
- **Customizable labels**, with sensible localized defaults.
- **Two layouts**: `normal` (full tank) and `compact` (mini tank + value list).
- **Option to hide labels** and show values only.
- Optional **icon** next to the title, or replacing it entirely.
- **Optional history chart** below or above the tank, with selectable period
  (2 h – 48 h), smooth area or line style, and per-sensor visibility.
- Up to four **extra values** from any entity (pressure, pump, valve, ...),
  placed in the title row, on the tank, beside it, or below it.
- Click any value to open the entity's **more-info** dialog.
- Built-in **graphical editor** — no YAML required.
- **Multilingual** UI (English / Italian, more welcome) following Home Assistant's language.
- Adapts to Home Assistant **themes**.

## Installation

### HACS (recommended)

Puffer Card is part of the [HACS default repositories](https://github.com/hacs/default),
so there is no custom repository to add.

1. Open **HACS** in Home Assistant.
2. Search for **Puffer Card** and open it.
3. Click **Download**, then reload your browser.
4. The Lovelace resource is registered automatically.

### Manual

1. Download `puffer-card.js` from the
   [latest release](https://github.com/giorgioparri/puffer-card/releases/latest)
   and copy it to `/config/www/puffer-card/puffer-card.js`. That single file is
   all you need: Lit and every translation are bundled inside it, so the card
   works offline and pulls nothing from a CDN.
2. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**:
   - URL: `/local/puffer-card/puffer-card.js`
   - Type: **JavaScript Module**
3. Reload the page.

> Upgrading from 1.3.0 or earlier? The old `translations/` folder next to
> `puffer-card.js` is no longer read and can be deleted.

## Configuration

Add a card to your dashboard, search for **Puffer Card**, and use the visual
editor — or configure it in YAML:

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline   # optional
icon_mode: beside                # "beside" or "replace"
layout: normal           # "normal" or "compact"
show_labels: true        # set to false to show values only
min_temp: 20            # temperature mapped to the cold color
max_temp: 80            # temperature mapped to the hot color
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
extra:
  entity: sensor.buffer_extra
  label: Extra
bottom:
  entity: sensor.buffer_bottom
  label: Return
show_chart: true        # optional history chart
chart_position: below   # "below" or "above"
chart_hours: 24         # 2, 6, 12, 24 or 48
chart_style: area       # "area" or "line"
chart_sensors:          # which positions to include in the chart
  - top
  - middle
  - extra
  - bottom
info_position: top      # top, inside, between, bottom or left
info:                   # up to four extra values, any entity
  - entity: sensor.heating_pressure
    label: Pressure
  - entity: binary_sensor.circulation_pump
    label: Pump
    icon: mdi:pump
```

To show **fewer than four values**, simply omit the positions you don't need
(for example only `top` and `bottom`). The displayed values are then
distributed evenly over the tank. With all four positions configured, the
tank grows slightly taller and badge text shrinks a little so nothing
overlaps — layouts with 1 to 3 sensors are unaffected.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `type` | string | – | `custom:puffer-card` (required) |
| `name` | string | localized | Card title; leave empty to hide it |
| `icon` | string | – | Optional icon (e.g. `mdi:propane-tank-outline`) |
| `icon_mode` | string | `beside` | `beside` the title or `replace` it |
| `layout` | string | `normal` | `normal` (full tank) or `compact` (mini tank + list) |
| `show_labels` | boolean | `true` | Show or hide the labels next to each value |
| `min_temp` | number | `20` | Temperature mapped to the cold color |
| `max_temp` | number | `80` | Temperature mapped to the hot color |
| `top` / `middle` / `extra` / `bottom` | object | – | A measuring point: `{ entity, label }` |
| `*.entity` | string | – | Temperature entity (`sensor`, `number` or `input_number`) |
| `*.label` | string | localized | Label shown next to the value |
| `unit` | string | from entity / `°C` | Force the unit of measurement |
| `show_chart` | boolean | `false` | Show the history chart |
| `chart_position` | string | `below` | `below` or `above` the tank |
| `chart_hours` | number | `24` | History period: `2`, `6`, `12`, `24` or `48` |
| `chart_style` | string | `area` | `area` (filled) or `line` |
| `chart_sensors` | list | all | Positions to include: `top`, `middle`, `extra`, `bottom` |
| `info_position` | string | `top` | Where the extra values go: `top`, `inside`, `between`, `bottom` or `left` |
| `info` | list | – | Up to four extra values: `{ entity, label, icon, show_label, show_icon }` |
| `info[].entity` | string | – | Any entity |
| `info[].label` | string | entity name | Label shown next to the value, and as tooltip |
| `info[].icon` | string | entity icon | Icon shown next to the value |
| `info[].show_label` | boolean | by position | Override whether the label is shown |
| `info[].show_icon` | boolean | by position | Override whether the icon is shown |

Whether an extra value shows its label and icon by default depends on the
position, since some have little room. The defaults for each position, and
the limits of `inside` and `left` in the compact layout, are in
[DOCS.md](https://github.com/giorgioparri/puffer-card/blob/v1.6.0-beta.1/DOCS.md#extra-values).
In the visual editor a new *Extra value* section appears as soon as the
previous one is filled in, up to four.

## Extra values

Up to four values from any entity, shown as Home Assistant formats them —
numbers in your locale, states translated — without a color scale. Here in the
title row, the default position, where they don't make the card any taller:

<img src="https://raw.githubusercontent.com/giorgioparri/puffer-card/v1.6.0-beta.1/images/info-top.png" alt="Extra values in the title row" width="420">

## Examples

[DOCS.md](https://github.com/giorgioparri/puffer-card/blob/v1.6.0-beta.1/DOCS.md)
shows every layout with the configuration that produces it: standard and
compact, values only, two and four sensors, the history chart, and the extra
values in each of their five positions, plus the visual editor.

## Languages

The UI language follows Home Assistant's own language setting, with English
as the fallback when a translation is missing or a language isn't available
at all.

Translations live under `src/translations/`: one JSON file per language.
They are compiled into `dist/puffer-card.js` at build time, so the card never
fetches them at runtime.

```
src/
├── i18n.js              # registry: which languages ship with the card
└── translations/
    ├── en.json          # reference language — every key must exist here
    └── it.json
```

**To contribute a new language:**

1. Copy `src/translations/en.json` to `src/translations/<code>.json` (use the
   language's [IETF tag](https://www.home-assistant.io/integrations/frontend/#language),
   e.g. `de.json` for German) and translate the values — keep the keys as-is.
2. Register it in `src/i18n.js`: add the `import` line and the entry in
   `TRANSLATIONS`.
3. Run `npm run check` — this rebuilds the bundle and verifies that the
   registry, the files on disk and the built bundle all agree, and that no key
   from `en.json` is missing. (Missing keys don't break anything: they silently
   fall back to English. The script catches typos and gaps before you open a
   PR.) The same check runs automatically in CI.
4. Commit the regenerated `dist/puffer-card.js` along with your changes, then
   open a pull request.

## Development

The card is bundled with [esbuild](https://esbuild.github.io/). `src/` is the
source of truth; `dist/puffer-card.js` is generated and committed.

```bash
npm install       # once
npm run build     # src/ -> dist/puffer-card.js
npm run check     # build, then validate translations and the bundle
```

Always commit the rebuilt `dist/puffer-card.js` together with any change under
`src/`: CI fails if the two are out of sync. The version string is injected at
build time — from the git tag on releases, from `package.json` otherwise — so
there is no version constant to edit by hand in the source.

## Color scale

Each temperature is mapped to a color between `min_temp` (blue) and `max_temp`
(red), passing through cyan, amber and orange. Tune `min_temp` / `max_temp` to
match your system so the colors are meaningful for your typical operating range.

## License

GPL-3.0-or-later — see [LICENSE](https://github.com/giorgioparri/puffer-card/blob/main/LICENSE)

## Acknowledgements

Built with the assistance of [Claude](https://claude.ai) by Anthropic.
