# Changelog

## Unreleased

### Added

- On Paseo 0.13 and newer, `.mmd` and `.mermaid` files open in the file tab as a diagram, with the same toolbar, and redraw when the file changes on disk. A diagram the plugin does not draw in full is rendered there by Paseo.

### Changed

- A message with a diagram the plugin cannot draw in full is left to Paseo's own Mermaid renderer instead of being drawn with lines missing or shown as source. That covers other diagram types, subgraphs, `style` and `classDef` lines, `&` and `;` joining several nodes or statements on one line, sequence blocks such as `loop`, `%%{init}%%` directives, and front matter. While a message streams, a line counts once its newline has arrived, so a half-typed line never hands the diagram over; a diagram that turns out to need Paseo switches renderer once. A finished message is judged on every line, even when its fence never closed.
- The flowchart parser refuses node shapes it would draw wrong instead of drawing them as boxes with stray brackets in the label: cylinders, hexagons (drawn as diamonds until now), parallelograms, trapezoids, double circles, and Markdown string labels. Diagrams with them go to Paseo.
- On Paseo 0.13 and newer, the text around a diagram is rendered with Paseo's own Markdown, so links, tables and highlighted code look as they do in the rest of the chat, and a reference link resolves even when its definition is on the other side of the diagram. Paseo 0.11 and 0.12 keep the plugin's renderer.

### Fixed

- A sequence message from a participant to itself is drawn as a loop beside its lifeline with its label next to it. It used to collapse to a one-pixel line with its label hidden. The drawing widens when the label would run past the last column.

### Removed

- The "lines not drawn" note under a flowchart and the "Showing the source instead" notice: those diagrams now go to Paseo.

## 0.3.1 - 2026-10-27

### Changed

- Paseo 0.14 checked, including its betas: a 0.14 daemon loads the plugin, and the plugin typechecks and passes its tests against the 0.14 SDK. 0.14 changes only the server half of the SDK and leaves the client entries as they were, so this client-only plugin did not need changes.

## 0.3.0 - 2026-10-26

### Added

- A plugin icon, a small flowchart, which the Paseo plugin directory shows on the listing. The manifest declares it as `assets/icon.png`, and the package check fails when the tarball lacks the icon the manifest names.

### Changed

- Requires Paseo 0.11 or newer, on the daemon and in the app. Paseo 0.8 to 0.10 and the 0.11.0 betas refuse a manifest with an `icon` field. Those versions can stay on 0.2.4: `paseo plugin add dutchakdev/paseo-plugin-mermaid --ref v0.2.4`.

## 0.2.4 - 2026-10-22

### Changed

- The README opens with a PNG preview and a short summary, and its install section lists
  the plugin directory, npm and GitHub sources by Paseo version.

## 0.2.3 - 2026-10-22

### Changed

- Paseo 0.13 checked, including its betas: a 0.13 daemon loads the plugin, and the plugin typechecks and passes its tests against the 0.13 SDK. The plugin keeps importing UI from `@getpaseo/plugin/client/react-native`, which 0.13 deprecates in favor of `client/ui` but still serves; only the old path works on every supported app from 0.8.

## 0.2.2 - 2026-10-17

### Changed

- Paseo 0.12 checked, including its betas: a 0.12 daemon loads the plugin, and the plugin typechecks and passes its tests against the 0.12 SDK. The plugin itself did not need changes.

## 0.2.1 - 2026-10-15

### Changed

- The npm package includes `OVERVIEW.md`, which the Paseo plugin directory shows on the
  plugin's page.
- npm releases are published from GitHub Actions with provenance, so you can trace a
  package version to the commit and workflow that built it.

## 0.2.0 - 2026-09-21

### Added

- A toolbar above every diagram: zoom out, the zoom level, zoom in, fit to view, pop out
  and show code. Zoom follows Paseo's own diagram viewer: 100% is the fitted drawing, in
  steps of 1.25 between 25% and 400%.
- Pop out opens the diagram in a modal fitted to the window, with its own zoom.

### Changed

- Requires Paseo 0.8 or newer: the plugin loads from an `index.client.tsx` runtime entry
  and the manifest declares `requirements.paseo`. Paseo 0.9, 0.10 and 0.11 are supported;
  npm releases start with this version.

## 0.1.0 - 2026-08-27

### Added

- Mermaid flowcharts and sequence diagrams in agent messages are drawn in the timeline
  with React Native views, on desktop and mobile.
- A diagram is drawn while its fence is still streaming, from whatever has parsed so far.
- The drawing is fitted to the row and scrolls sideways once labels would become too
  small to read; edges that skip a layer get their own lane instead of crossing nodes.
