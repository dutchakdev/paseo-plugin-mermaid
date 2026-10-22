# Changelog

## Unreleased

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
