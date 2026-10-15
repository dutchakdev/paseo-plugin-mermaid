# Changelog

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
