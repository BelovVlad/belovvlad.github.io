# Hyle AI renderer

The source lives here; `search/ai-renderer.js` is the checked-in browser bundle.
Pinned dependencies and `pnpm-lock.yaml` make the build reproducible. The browser
loads local assets, including KaTeX fonts; no CDN or additional key is required.

```sh
pnpm install --frozen-lockfile
node build.mjs
node --test tests/*.test.mjs
```

From a checkout named `home` alongside `helper` and `department`, run
`node build.mjs --sync-sites` to copy the common AI assets to the two sites.
This never commits, pushes or publishes. Sites without this sibling layout can
copy the listed assets in `build.mjs` explicitly. Builds of Helper/Department
already copy their complete `assets` directories.

`tests/browser.mjs` starts its own loopback preview and tests both site dialogs.
It requires Playwright and Edge (`HYLE_BROWSER_CHANNEL` overrides the browser).
`HYLE_PLAYWRIGHT_MODULE` optionally points to an installed Playwright ESM module.
Generate local catalogs with `node site/scripts/build.mjs` in each site first.
The test uses synthetic SSE replies and a test-only browser key. Screenshots are
written to ignored `artifacts/`. It never calls a real AI provider.

`node tests/ux-browser.mjs` uses the same setup to check immediate Home → search
opening while remote catalogs are deliberately held pending, preservation of the
query, collapsible AI filters, keyboard viewport resizing in an iframe and on a
standalone site, scroll-controlled header visibility, and return navigation.
It also checks desktop filters. Viewport changes simulate the on-screen keyboard;
physical iOS/Android keyboard behavior still needs a device check. The overlay
follows the top-level VisualViewport because an iframe's visual viewport alone
does not describe the area covered by the keyboard.

`node --test tests/catalog.test.mjs` checks partial loading and source failure
without contacting the network.

Markdown is parsed with markdown-it and the texmath token plugin. Raw HTML is
disabled; HTML/MathML/SVG output is sanitized with DOMPurify. KaTeX uses
`trust: false`, bounded macro expansion and fresh macro state per expression.
Remote images are disabled. Citation links are tokenized outside code/math/links,
and generated from allowlisted Hyle reader paths rather than arbitrary source URLs.
An incomplete SSE answer remains available and is labelled as interrupted.

References: [markdown-it security](https://github.com/markdown-it/markdown-it/blob/master/docs/safety.md),
[KaTeX options](https://katex.org/docs/options.html),
[texmath delimiters](https://github.com/goessner/markdown-it-texmath).
Bundled license notices are in `search/ai-licenses.txt`.
