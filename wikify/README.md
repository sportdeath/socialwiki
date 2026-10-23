# Wikify

Wikify gives a hosted site a Social.Wiki editing shell. It discovers published versions of one site, displays the latest admin version (or your own version while signed in), and provides editing and account controls. It is a JavaScript library, not an editable Social.Wiki document or lens.

The build produces a browser module at `dist/wikify.js`. The root build publishes it at `https://social.wiki/wikify.js`. Wikify imports Vue and Graffiti's Vue wrapper from the import map that `init.js` installs in the same document. The Graffiti API is used only for TypeScript types. The page loads `init.js` first as a classic script so its import map and Social.Wiki sandbox are ready before the module runs.

For local testing, run `npm run dev` from the repository root and open [the example site](http://localhost:5173/wikify-example.html). It uses the published `Social.Wiki` homepage and loads the local kernel and Wikify builds. The example is served only by the development build.

## Host page

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My Site</title>
    <script src="https://social.wiki/init.js"></script>
    <style>
      :root { --wikify-accent: #1769d1; }
      #wikify > header { border-bottom-width: 2px; }
    </style>
    <script type="module">
      import { wikify } from "https://social.wiki/wikify.js";

      wikify({
        siteName: "my-site",
        admins: ["did:plc:your-admin-id"],
        showHeader(query) {
          const { address } = window.route.parseQuery(query);
          return !address || address === "people";
        },
      });
    </script>
  </head>
  <body>
    <div id="wikify">Loading…</div>
  </body>
</html>
```

`siteName` must match the name used when publishing the site's HTML through Social.Wiki. `admins` are Graffiti actor IDs whose versions are shown to everyone. A signed-in person sees their own version if they have one. When an admin publishes a newer version, the account menu shows an alert with the publisher and summary. The menu offers Preview new version and Upgrade to new version. Preview temporarily shows the admin version without writing to Graffiti; while previewing, Return to my version ends the preview and leaves the alert available, while Upgrade to this new version starts following admin versions. A preview also ends on refresh. Without upgrading, the alert remains available. After upgrading, later admin publications appear automatically until the person publishes a new version of their own. A subsequent admin publication can then trigger another alert.

Wikify reads publications and private follow records in one Graffiti discovery over `site:${siteName}`. Publications use the existing `Publish site` value with `site name`, `changes`, `document`, `time`, and optional `previous versions`. Upgrading posts one private object with `allowed: []`, `channels: ["site:" + siteName]`, and a value containing only `action: "Follow site admin versions"` and `my version` (the person's current publication URL). The channel identifies the site. The presence of a follow record for the current personal publication selects the latest admin publication, including future ones. Publishing a new personal version changes that URL and ends following. Only the follow record's creator can read it. Preview uses local component state and has no Graffiti object. Earlier choice records are ignored.

The optional `showHeader` callback receives the **complete** `window.query` string, so it can inspect both address and parameters. The header is shown by default. Wikify always fills the viewport below its header; the displayed site handles its own scrolling. `title` optionally overrides the page's `<title>`, and `mount` optionally selects a different element (CSS selector or `HTMLElement`).

## Styling

Wikify renders into the normal DOM. Its bundled base CSS is inserted before the host page's styles, so a page can override it with ordinary CSS. There is no Shadow DOM or JavaScript styling configuration. A classless stylesheet can be added to the page if desired; Wikify supplies the layout needed for the header, menu, dialog, and transclusion.

The mount element gets `.wikify` and the body gets `.wikify-page`. The shell uses semantic elements for its structure, with classes for the action group and account menu panel. The shared highlighted control uses `.wikify-primary-action`. The CSS custom properties are optional: `--wikify-accent`, `--wikify-accent-hover`, `--wikify-border`, `--wikify-surface`, `--wikify-text`, `--wikify-control-background`, `--wikify-control-text`, `--wikify-dialog-background`, and `--wikify-danger`.

For example:

```css
:root { --wikify-accent: rebeccapurple; }
#wikify > header { padding: 1rem 2rem; }
#wikify .wikify-primary-action { border-radius: 999px; }
```
