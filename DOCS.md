# Puffer Card — examples

Every picture on this page comes with the configuration that produces it. The entity IDs are placeholders: replace them with your own. The complete list of options is in the [README](README.md#options).

Everything shown here can also be set from the card's visual editor; YAML is only one way to write it down.

## Contents

- [Layouts](#layouts)
  - [Standard](#standard)
  - [Compact](#compact)
  - [Values only](#values-only)
  - [Two sensors](#two-sensors)
  - [Four sensors](#four-sensors)
- [History chart](#history-chart)
- [Extra values](#extra-values)
  - [Options](#options)
  - [Top](#top)
  - [Inside](#inside)
  - [Between tank and chart](#between-tank-and-chart)
  - [Bottom](#bottom)
  - [Left](#left)
  - [Mixing positions](#mixing-positions)
  - [Visual editor](#visual-editor)

## Layouts

### Standard

The full tank with value badges on the side.

<img src="images/standard.png" alt="Standard layout" width="380">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
```

### Compact

A small tank next to a list of values, for dense dashboards.

<img src="images/compact.png" alt="Compact layout" width="320">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
layout: compact
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
```

### Values only

With `show_labels: false` the labels are removed. In the compact layout the values move next to the tank.

<img src="images/compact-no-labels.png" alt="Compact layout without labels" width="320">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
layout: compact
show_labels: false
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
```

### Two sensors

Configure only the positions you have. With fewer than four values they are spread evenly over the tank height instead of staying at the extremes.

<img src="images/two-sensors.png" alt="Two values evenly distributed" width="380">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
top:
  entity: sensor.buffer_top
  label: Flow
bottom:
  entity: sensor.buffer_bottom
  label: Return
```

### Four sensors

With all four positions configured the tank grows taller and the badge text shrinks a little, so the four values stay comfortably spaced. The side pipes follow the number of configured sensors.

<img src="images/four-sensors.png" alt="Four sensors, taller tank" width="380">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_upper
  label: Upper
extra:
  entity: sensor.buffer_lower
  label: Lower
bottom:
  entity: sensor.buffer_bottom
  label: Return
```

## History chart

`show_chart: true` adds a history chart below the tank (`chart_position: above` moves it on top). Each sensor gets a fixed color, and with more than one sensor in the chart the dots on the tank switch to the same colors, so they double as the legend.

<img src="images/chart-normal.png" alt="Standard layout with history chart" width="380">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
show_chart: true
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
```

The same chart in the compact layout:

<img src="images/chart-compact.png" alt="Compact layout with history chart" width="320">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
layout: compact
show_chart: true
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
```

`chart_hours` (2, 6, 12, 24 or 48), `chart_style` (`area` or `line`) and `chart_sensors` (which positions to draw) are described in the [README](README.md#options).

## Extra values

Besides the temperatures, the card can show up to four values from any entity: the system pressure, a pump or a valve, a setpoint. They are shown as they are — no color scale, no chart — and formatted by Home Assistant itself, so numbers follow your locale and states are translated (`on` becomes *Running* for a pump). Click a value to open the entity's more-info dialog.

Each value has its own position, so the pressure can sit in the title row and the pump at the bottom of the same card.

### Options

`info` lists the values, each with its own `position`:

```yaml
info:
  - entity: sensor.heating_pressure
    position: top         # top, inside, between, bottom or left
    label: Pressure       # optional, defaults to the entity's name
    icon: mdi:gauge       # optional, defaults to the entity's icon
    show_label: true      # optional, see below
    show_icon: true       # optional, see below
```

| Key | Default | Description |
|---|---|---|
| `entity` | – | Any entity |
| `position` | `top` | `top`, `inside`, `between`, `bottom` or `left` |
| `label` | entity name | Text shown next to the value, and as tooltip |
| `icon` | entity icon | Icon; without one, Home Assistant picks it from the domain and device class |
| `show_label` | depends on position | `true` / `false` to override the default |
| `show_icon` | depends on position | `true` / `false` to override the default |

Some positions have little room, so whether label and icon are shown depends on where the values go. Set `show_label` or `show_icon` on an entry to override it; when the label is hidden it is still shown as a tooltip.

| `position` | Label | Icon |
|---|---|---|
| `top` | hidden | shown |
| `inside` | shown, hidden in compact | hidden |
| `between` | shown | shown |
| `bottom` | shown | shown |
| `left` | shown, hidden in compact | hidden |

Several values with the same position are grouped together, in the order of the list.

The examples below all use the same two entries — the pressure and the pump — placed at the same position, so each picture shows one position at a time; [Mixing positions](#mixing-positions) puts them in two different places. The pressure sensor has no `icon`: the gauge comes from its `pressure` device class.

### Top

The default position. The values sit in the title row, aligned right, so the card gets no taller. Labels are hidden by default to leave room for the title.

<img src="images/info-top.png" alt="Extra values in the title row" width="380">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
info:
  - entity: sensor.heating_pressure
    position: top
    label: Pressure
  - entity: binary_sensor.circulation_pump
    position: top
    label: Pump
    icon: mdi:pump
```

### Inside

The values are drawn on the tank body, in the gaps between the sensor lines. The card gets no taller.

<img src="images/info-inside.png" alt="Extra values inside the tank" width="380">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
info:
  - entity: sensor.heating_pressure
    position: inside
    label: Pressure
  - entity: binary_sensor.circulation_pump
    position: inside
    label: Pump
    icon: mdi:pump
```

> **Compact layout:** the small tank only has room for one value, so only the **first** entry with `position: inside` is shown, without its label. Further `inside` entries are ignored; entries at other positions are shown as usual.

### Between tank and chart

The values sit between the tank and the history chart, on whichever side the chart is. Without the chart this position behaves like `bottom`.

<img src="images/info-between.png" alt="Extra values between tank and chart, compact layout" width="320">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
layout: compact
show_chart: true
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
info:
  - entity: sensor.heating_pressure
    position: between
    label: Pressure
  - entity: binary_sensor.circulation_pump
    position: between
    label: Pump
    icon: mdi:pump
```

### Bottom

The values sit at the very bottom of the card, below the chart if there is one. This position has the most room, so it is the most readable, at the cost of a slightly taller card.

<img src="images/info-bottom.png" alt="Extra values at the bottom" width="380">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
show_chart: true
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
info:
  - entity: sensor.heating_pressure
    position: bottom
    label: Pressure
  - entity: binary_sensor.circulation_pump
    position: bottom
    label: Pump
    icon: mdi:pump
```

### Left

The values run vertically along the left side of the tank, reading bottom to top, and the card gets no taller. In the standard layout they use the empty strip next to the tank, so keep the labels short. In the compact layout only the value is shown by default: set `show_icon: true` on the entries if you need to tell them apart.

<img src="images/info-left.png" alt="Extra values on the left side, compact layout" width="320">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
layout: compact
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
info:
  - entity: sensor.heating_pressure
    position: left
    label: Pressure
  - entity: binary_sensor.circulation_pump
    position: left
    label: Pump
    icon: mdi:pump
```

### Mixing positions

Every value goes where its own `position` says: here the pressure in the title row and the pump at the bottom.

<img src="images/info-mixed.png" alt="Pressure in the title row, pump at the bottom" width="380">

```yaml
type: custom:puffer-card
name: Heating buffer
icon: mdi:propane-tank-outline
show_chart: true
top:
  entity: sensor.buffer_top
  label: Flow
middle:
  entity: sensor.buffer_middle
  label: Storage
bottom:
  entity: sensor.buffer_bottom
  label: Return
info:
  - entity: sensor.heating_pressure
    position: top
    label: Pressure
  - entity: binary_sensor.circulation_pump
    position: bottom
    label: Pump
    icon: mdi:pump
```

### Visual editor

The editor shows the values as up to four sections, *Extra value 1* to *4*: one more appears as soon as the previous one is filled in. Each section has its own *Position*, right below the entity. *Show label* and *Show icon* offer *Auto*, *Show* and *Hide*; *Auto* leaves the option out of the configuration, so the default of that value's position applies.

<img src="images/editor-info.png" alt="Extra values in the visual editor" width="512">
