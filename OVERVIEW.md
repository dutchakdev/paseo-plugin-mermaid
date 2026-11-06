Mermaid draws `mermaid` code blocks in agent and user messages as diagrams in the chat timeline, at the width of the message and from the first streamed line. It draws flowcharts and sequence diagrams. Flowchart shapes include cylinders, hexagons, parallelograms, trapezoids and double circles, written in brackets or in the Mermaid 11 `@{ shape }` syntax.

Other diagrams go to Mermaid. On Paseo 0.13 and newer, a diagram the plugin does not draw in full (other diagram types, subgraphs, `style` and `classDef` lines, sequence blocks like `loop`, `%%{init}%%` directives) is rendered by Mermaid through Paseo's Markdown, inside the plugin's message, and the message's other diagrams stay inline. A message that defines reference-style links or footnotes is rendered whole by Paseo's Markdown. On Paseo 0.11 and 0.12, such messages are left to Paseo's own renderer. On Android, parallelograms and trapezoids go to Mermaid too, because React Native cannot skew a View there.

Paseo's renderer refuses `@{`, so the plugin first writes the shape objects it reads in bracket syntax. An object it does not read, such as another shape name or a key like `img`, shows as code.

On Paseo 0.13 and newer, the text around a diagram uses Paseo's own Markdown, so it looks like the rest of the chat. On Paseo 0.11 and 0.12 it uses a limited renderer (headings, lists, emphasis and code). Messages without a diagram are left to Paseo.

With Better Paseo installed, turn off its "Plugin markdown for replies" setting, which is on by default. Paseo gives a reply to the first plugin that takes it, `better-paseo` comes first, and with that setting on it shows mermaid blocks as code before this plugin sees them.

Each diagram has a toolbar to zoom, fit to view, pop out to a larger view, and show the code. Zoom matches Paseo's own diagram viewer: 100% is the drawing fitted to the row.

On Paseo 0.13 and newer, `.mmd` and `.mermaid` files open in the file tab as a diagram, which redraws when the file changes on disk.

The plugin runs entirely in the Paseo app on desktop and mobile, works with Paseo 0.11 or newer, has no settings, and needs no additional setup.

## Other plugins by dutchakdev

- [Account Switcher](https://paseo.sh/plugins/dutchakdev/account-switcher): several Claude and ChatGPT/Codex subscription accounts in Paseo, with an account per agent, switching of an existing chat, and every account's limits.
- [Machine Status](https://paseo.sh/plugins/dutchakdev/machine-status): load, memory, disk, the ports and processes your agents started, and Docker on the daemon's Mac, with dev-cache cleanup and confirmed process stops.
- [secure-input](https://paseo.sh/plugins/dutchakdev/secure-input): agents ask you for secrets through a form, and each value lands in a short-lived file the agent moves without reading it.
