import type { ComponentType } from "react";
import type { PluginClientContext, PluginFilePanelContribution } from "@getpaseo/plugin/client";

/*
 * The plugin supports apps from Paseo 0.11 while its SDK types are 0.13's, so the
 * types promise members that older apps do not have. The app maps a missing export
 * or method to `undefined` rather than failing to load, which is what these checks
 * read. Keep every 0.13-only call behind one of them.
 */

/** Paseo's Markdown component from `@getpaseo/plugin/client/ui`; apps before 0.13 have none. */
export function hostMarkdown(ui: object): ComponentType<{ children: string }> | null {
  return (ui as { Markdown?: ComponentType<{ children: string }> }).Markdown ?? null;
}

/** Registers a file panel where the app has file panels (0.13 and later); returns its cleanup, or null. */
export function addFilePanel(client: PluginClientContext, contribution: PluginFilePanelContribution): (() => void) | null {
  const add = (client as Partial<Pick<PluginClientContext, "addFilePanel">>).addFilePanel;
  return typeof add === "function" ? add.call(client, contribution) : null;
}
