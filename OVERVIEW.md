Mermaid draws `mermaid` code blocks in agent and user messages as diagrams in the chat timeline instead of showing the source. It supports flowcharts and sequence diagrams. Subgraphs, `style` and `classDef` directives, and other diagram types are not supported. Lines the parser does not recognize are counted under the drawing, and a diagram that cannot be parsed is shown as source.

Diagrams are drawn from the message text when the message renders, and drawing starts while the code block is still streaming. A message that contains a diagram is rendered by the plugin, so the text around the diagram uses a limited Markdown renderer (headings, lists, emphasis and code). Messages without a diagram are left to Paseo.

Each diagram has a toolbar to zoom, fit to view, pop out to a larger view, and show the code. Zoom matches Paseo's own diagram viewer: 100% is the drawing fitted to the row.

The plugin runs entirely in the Paseo app on desktop and mobile, works with Paseo 0.11 to 0.14, has no settings, and needs no additional setup.
