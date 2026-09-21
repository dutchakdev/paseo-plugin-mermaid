import { describe, expect, it } from "vitest";
import { MIN_SCALE, fitScale } from "../shared/layout";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  canZoomIn,
  canZoomOut,
  fitBothScale,
  fitRowZoom,
  sameZoom,
  toolbarState,
  zoomIn,
  zoomLabel,
  zoomOut,
} from "../shared/zoom";

describe("zoom steps", () => {
  it("starts at 100% and steps by a quarter, the way the Paseo viewport does", () => {
    expect(zoomIn(1)).toBeCloseTo(1.25);
    expect(zoomOut(1)).toBeCloseTo(0.8);
  });

  it("returns exactly to 100% after stepping in and back out", () => {
    // 1.25 * 0.8 is not 1 in floating point; the label and the disabled state
    // of the fit button both compare against 1, so the step has to land on it.
    expect(zoomOut(zoomIn(1))).toBe(1);
    expect(zoomIn(zoomOut(1))).toBe(1);
  });

  it("stops at the limits instead of overshooting them", () => {
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomIn(3.5)).toBe(ZOOM_MAX);
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(zoomOut(0.3)).toBe(ZOOM_MIN);
  });

  it("reports when a step is no longer possible, so the button can go quiet", () => {
    expect(canZoomIn(1)).toBe(true);
    expect(canZoomIn(ZOOM_MAX)).toBe(false);
    expect(canZoomOut(1)).toBe(true);
    expect(canZoomOut(ZOOM_MIN)).toBe(false);
  });

  it("labels the zoom as a whole percent", () => {
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(0.8)).toBe("80%");
    expect(zoomLabel(1.5625)).toBe("156%");
    expect(zoomLabel(0.5454)).toBe("55%");
  });

  it("treats zooms that differ by less than a rounding error as the same", () => {
    expect(sameZoom(1, 1.0000000000000002)).toBe(true);
    expect(sameZoom(1, 1.01)).toBe(false);
  });
});

describe("fitRowZoom", () => {
  it("shrinks a wide drawing that hit the readability floor until all of it shows", () => {
    // fitScale stops at MIN_SCALE and lets the row scroll; fit to view goes past that.
    const rowScale = fitScale(600, 2000);
    expect(rowScale).toBe(MIN_SCALE);
    expect(fitRowZoom(rowScale, 2000, 600)).toBeCloseTo(600 / (2000 * MIN_SCALE));
    expect(fitRowZoom(rowScale, 2000, 600)).toBeLessThan(1);
  });

  it("never grows a drawing past its default size", () => {
    // A three-node chart in a wide row would otherwise become a poster.
    expect(fitRowZoom(fitScale(900, 300), 300, 900)).toBe(1);
  });

  it("is a no-op when the drawing already fits the row", () => {
    expect(fitRowZoom(fitScale(900, 1200), 1200, 900)).toBe(1);
  });

  it("leaves the drawing alone before the row has been measured", () => {
    expect(fitRowZoom(0.75, 1200, 0)).toBe(1);
    expect(fitRowZoom(0, 1200, 900)).toBe(1);
    expect(fitRowZoom(0.75, 0, 900)).toBe(1);
  });
});

describe("fitBothScale", () => {
  it("fits both axes of the pop-out without changing the aspect ratio", () => {
    expect(fitBothScale({ width: 1600, height: 800 }, { width: 800, height: 600 })).toBe(0.5);
    expect(fitBothScale({ width: 400, height: 800 }, { width: 800, height: 600 })).toBe(0.75);
  });

  it("keeps the padding clear of the drawing", () => {
    expect(fitBothScale({ width: 1600, height: 800 }, { width: 800, height: 600 }, 20)).toBe(760 / 1600);
  });

  it("grows a small drawing to fill the window, which is what popping out is for", () => {
    expect(fitBothScale({ width: 300, height: 200 }, { width: 1200, height: 900 })).toBe(4);
  });

  it("leaves the drawing alone before the window has been measured", () => {
    expect(fitBothScale({ width: 300, height: 200 }, { width: 0, height: 0 })).toBe(1);
    expect(fitBothScale({ width: 0, height: 200 }, { width: 1200, height: 900 })).toBe(1);
  });
});

describe("toolbarState", () => {
  it("offers the zoom steps and the pop-out at the default zoom", () => {
    expect(toolbarState({ zoom: 1, fitZoom: 1, showCode: false })).toEqual({
      zoomIn: true,
      zoomOut: true,
      fit: false,
      popOut: true,
    });
  });

  it("offers fit to view only when it would change something", () => {
    expect(toolbarState({ zoom: 1, fitZoom: 0.6, showCode: false }).fit).toBe(true);
    expect(toolbarState({ zoom: 0.6, fitZoom: 0.6, showCode: false }).fit).toBe(false);
    expect(toolbarState({ zoom: 0.6000001, fitZoom: 0.6, showCode: false }).fit).toBe(false);
  });

  it("quiets the step that has reached its limit", () => {
    expect(toolbarState({ zoom: ZOOM_MAX, fitZoom: 1, showCode: false }).zoomIn).toBe(false);
    expect(toolbarState({ zoom: ZOOM_MIN, fitZoom: 1, showCode: false }).zoomOut).toBe(false);
  });

  it("quiets every drawing control while the source is shown", () => {
    // Zooming text that is not on screen would be a change the reader cannot see.
    expect(toolbarState({ zoom: 1, fitZoom: 0.6, showCode: true })).toEqual({
      zoomIn: false,
      zoomOut: false,
      fit: false,
      popOut: false,
    });
  });
});
