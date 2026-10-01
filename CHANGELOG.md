# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.5.2] - 2026-09-28

### Changed
- The project moved to the GitHub username `giorgioparri` (previously `naked-head`): links and badges in the README and the repository URL in the card's own metadata are updated. Nothing to do — existing installations keep working and GitHub redirects the old repository URLs.
- The release workflow now checks that the README screenshots are pinned to the tag being released, so the README shown in HACS matches the installed version.

### Fixed
- Links to other files in the repository are absolute, so they work in the README rendered by HACS. Relative targets are blanked by Home Assistant's markdown sanitiser, which left the links dead exactly where users read the page.

## [1.5.1] - 2026-08-28

### Changed
- Relicensed from MIT to GPL-3.0-or-later.

### Fixed
- The license badge and the LICENSE link no longer break when the README is rendered inside HACS. Both used a relative target (`LICENSE`), and HACS prefixes relative paths with the repository's raw base URL, which produced an invalid address. They now point at the file on GitHub, matching the other three badges.
- The "Open in HACS" button is back under the badges, where the other cards have it.

## [1.5.0] - 2026-08-25

### Added
- `dist/puffer-card.js` is now attached as a release asset. HACS installs that single file directly instead of downloading the repository source, which enables the download counter in HACS and makes installs smaller and faster.
  Made possible by 1.4.0, where the card became self-contained: with Lit and the translations bundled in, there is nothing else left to download.
- The version reported in the browser console now carries the full tag, pre-release suffix included (for example `v1.5.0-beta.1`), because the asset is built from the tag rather than from `package.json`. Useful when checking which build an instance is actually running.

### Fixed
- The license badge in the README no longer renders as a broken image. It used the GitHub-API-backed shields.io endpoint, which can fail to answer; since the license never changes, it is now a static badge.
- Release notes on GitHub no longer show ragged mid-sentence line breaks. `CHANGELOG.md` is hard-wrapped at ~80 columns, and GitHub renders release bodies with hard line breaks (every newline becomes a `<br>`), unlike `.md` files in the repo. The release workflow now unwraps paragraphs before publishing them.

### Changed
- README: documented that the card is available directly in HACS, with install steps that no longer mention adding a custom repository, and the badge now reads "HACS Default" instead of "HACS Custom".
- Manual installs can now download `puffer-card.js` straight from the release page instead of copying it out of the repository.

## [1.4.0] - 2026-08-25

### Changed
- The card is now a single self-contained bundle. `dist/puffer-card.js` is generated from `src/` with [esbuild](https://esbuild.github.io/) instead of being hand-written, and includes everything it needs at runtime.
- Lit is bundled into the card instead of being imported from a CDN (`cdn.jsdelivr.net`) on first load. The card now works on installations without internet access, no longer depends on a third-party host staying available, and loads one fewer external resource. Despite embedding Lit, the built file is slightly smaller than the previous hand-written source.
- Translations are compiled into the bundle instead of being fetched at runtime from `dist/translations/`. Language lookups are synchronous, so the editor and the card no longer re-render once translations arrive.
- Translation sources moved from `dist/translations/` to `src/translations/`, with `src/i18n.js` as the single registry of shipped languages.
- The version string is injected at build time from the git tag, removing the manual step of keeping the `VERSION` constant in sync before tagging.
- `scripts/check-translations.js` now validates the new layout: that `src/i18n.js` and `src/translations/` agree with each other, and that every language is actually present in the built bundle.
- **Manual installs:** copying `dist/puffer-card.js` on its own is now enough.
  The `translations/` folder next to it is no longer read and can be deleted.
  HACS installs are unaffected and upgrade normally.

### Removed
- `dist/translations/` (moved to `src/translations/` and bundled).
- `dist/translations/index.json`: the list of shipped languages now lives in `src/i18n.js`, so there is no second manifest that can fall out of sync.
- The inline `FALLBACK_EN` table in the source. `en.json` is guaranteed to be in the bundle, so the duplicate copy of the English strings — which could silently drift from `en.json` — is no longer needed.

## [1.3.0] - 2026-07-05

### Added
- Fourth optional sensor position (`extra`), sitting between `middle` and `bottom`. Fully backward compatible: existing configs with only `top`/`middle`/`bottom` render pixel-identical to before — the extra slot is simply left unconfigured. With all four positions set, the tank (normal layout) grows taller and badge text shrinks slightly so nothing overlaps; both layouts get slightly smaller fonts in this case.
- Side pipes in the normal layout now follow the number of configured sensors (1 to 4), each centered on its sensor's height, instead of a fixed pair of decorative pipes.
- A 4th fixed chart color (teal) so a 4-sensor history chart never repeats a color between series.
- `dist/translations/index.json`, a manifest listing the languages shipped with the card, plus `scripts/check-translations.js` to validate that every language file has the same keys as the English reference — wired into the `Validate HACS` CI workflow. Documented in the README under "Languages" as the path for contributing a new translation (no code changes required).

## [1.2.3] - 2026-07-01

### Fixed
- White flash on the chart every ~60 seconds during periodic data refresh. `_histLoading` was a Lit reactive property, so setting it to `true` at the start of every fetch triggered a full re-render that momentarily replaced the chart with the loading placeholder — visible as a white flash.
  Fix: `_histLoading` is no longer a reactive property; re-renders are triggered manually via `requestUpdate()` only when data actually arrives.
  The loading placeholder is shown only during the very first fetch (when no history data exists yet); subsequent silent refreshes keep the existing chart visible until new data is ready.

## [1.2.2] - 2026-07-01

### Fixed
- Blank chart area requiring a page reload to recover. Three root causes:
  1. The refresh logic ran inside `updated()`, which Lit calls after every reactive property change. Setting `_histLoading = true` triggered a re-render, which triggered `updated()` again while hass kept updating in the background, causing cascading fetch calls.
  2. There was no concurrency guard: two `_fetchHistory()` calls running in parallel would write to `_history` and `_histLoading` out of order, producing inconsistent state visible as repeated flickering followed by a blank chart.
  3. Any network/API error inside `_fetchHistory()` left `_histLoading` permanently set to `true`, showing only the loading placeholder.
  The fetch cycle is now driven by `setInterval` started in `connectedCallback` and cleared in `disconnectedCallback`. A `_fetching` flag prevents concurrent calls, and a try/finally block ensures `_histLoading` is always reset even on error.

## [1.2.1] - 2026-06-30

### Fixed
- The `icon_mode` field was missing from the visual editor when editing an existing card without an icon already set, making the option undiscoverable. It is now always shown.
- The chart sensor selector bug from 1.2.0 was only fixed in the card itself, not in the visual editor (which keeps its own separate copy of the configuration): on first enabling the chart, the editor's checkboxes still appeared empty even though the chart correctly showed all sensors. The editor now applies the same defaulting logic as the card.

### Changed
- History chart data is now downsampled (averaged into fixed time bins, roughly one point per 4 px of chart width) before the smoothing curve is drawn. Raw History API data can be noisy with many closely-spaced state changes; without downsampling the smoothed curve still looked jagged. The chart is now visually calmer and closer to other popular history-graph cards, regardless of how many raw data points the sensor produced.

## [1.2.0] - 2026-06-30

### Added
- Optional `icon` next to the card title, or replacing it entirely (`icon_mode: beside` / `replace`), selectable via the visual editor's icon picker. The stub configuration now suggests a default tank icon.

### Changed
- History chart curves are now smoothed using Catmull-Rom interpolation (converted to cubic Béziers), matching the look of popular history-graph cards instead of straight-segment lines.

### Fixed
- The chart sensor multi-select could get out of sync with the rendered chart: on first enabling the chart, all configured sensors were drawn but none appeared selected in the editor — selecting one made the others disappear, and deselecting it left an empty chart area. `chart_sensors` is now always explicitly populated with all configured sensors as soon as the chart is enabled, so editor and rendering stay consistent from the start.

## [1.1.2] - 2026-06-30

### Fixed
- Chart configuration fields (`show_chart`, `chart_position`, `chart_hours`, `chart_style`, `chart_sensors`) were not localized in the visual editor and always showed up in English regardless of the Home Assistant language. The editor's label resolver now covers all chart-related fields.

## [1.1.1] - 2026-06-29

### Fixed
- Translation error on graphical editor window.

## [1.1.0] - 2026-06-29

### Added
- Optional history chart rendered below or above the tank (configurable).### Fixed
- Links to other files in the repository are absolute, so they work in the README rendered by HACS. Relative targets are blanked by Home Assistant's markdown sanitiser, which left the links dead exactly where users read the page.
- Selectable history period: 2 h, 6 h, 12 h, 24 h, 48 h.
- Two chart styles: area (filled) or lines only.
- Selector to choose which configured sensors appear in the chart.
- When the chart is active and more than one series is shown, the tank dots switch to fixed series colors (red / orange / blue) to match the chart legend, instead of the temperature-ramp color.
- History data fetched via HA REST History API; auto-refreshed every 60 s.

## [1.0.0] - 2026-06-18

### Added
- Visual buffer-tank (puffer) card for Home Assistant / Lovelace.
- Display of 1 to 3 temperatures at different heights; values are distributed evenly over the tank when fewer than three are configured.
- Color-coded thermal stratification (blue → cyan → amber → red) driven by the configurable `min_temp` / `max_temp` range.
- `normal` and `compact` layouts, selectable from the visual editor.
- `show_labels` option to show values only (labels hidden).
- Customizable labels with localized defaults.
- Click any value to open the entity's more-info dialog.
- Built-in graphical editor (ha-form), no YAML required.
- Multilingual UI (English / Italian) loaded from external per-language files under `dist/translations/`, with a built-in English fallback so the UI never shows raw keys.
- Theme-aware styling.

[Unreleased]: https://github.com/giorgioparri/puffer-card/compare/v1.5.2...HEAD
[1.5.2]: https://github.com/giorgioparri/puffer-card/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/giorgioparri/puffer-card/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/giorgioparri/puffer-card/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/giorgioparri/puffer-card/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/giorgioparri/puffer-card/compare/v1.2.3...v1.3.0
[1.2.3]: https://github.com/giorgioparri/puffer-card/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/giorgioparri/puffer-card/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/giorgioparri/puffer-card/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/giorgioparri/puffer-card/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/giorgioparri/puffer-card/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/giorgioparri/puffer-card/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/giorgioparri/puffer-card/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/giorgioparri/puffer-card/releases/tag/v1.0.0