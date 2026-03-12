// .figmaexportrc.js
// Figma Export — Noelle Mobile (Dark)
// File: https://www.figma.com/design/a6PHaT6GaxDYFGRuGNxTGZ/Noelle-Mobile--Dark-
//
// Usage:
//   FIGMA_TOKEN=<your_token> figma-export components a6PHaT6GaxDYFGRuGNxTGZ
//   FIGMA_TOKEN=<your_token> figma-export styles a6PHaT6GaxDYFGRuGNxTGZ
//
// Or with this config:
//   FIGMA_TOKEN=<your_token> figma-export use-config

module.exports = {
  commands: [
    [
      'components',
      {
        fileId: 'a6PHaT6GaxDYFGRuGNxTGZ',
        // Page to export from (first page = dark UI kit)
        onlyFromPages: ['Noelle Mobile UI Kit (Dark)'],
        outputters: [
          // Export SVG components to design/figma-export/
          require('@figma-export/output-components-as-svg')({
            output: './design/figma-export/svg',
          }),
        ],
        transformers: [],
      },
    ],
    [
      'styles',
      {
        fileId: 'a6PHaT6GaxDYFGRuGNxTGZ',
        // Note: this file has no named Figma style library.
        // Tokens were extracted manually via the document tree walk.
        // Re-run the extraction script below when the Figma file changes:
        //
        //   curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
        //     "https://api.figma.com/v1/files/a6PHaT6GaxDYFGRuGNxTGZ" | \
        //     python3 scripts/extract_figma_tokens.py
        outputters: [],
      },
    ],
  ],
};
