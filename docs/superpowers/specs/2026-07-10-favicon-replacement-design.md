# Favicon Replacement Design

## Goal

Replace only the browser-tab favicon with the user-provided 256×256 PNG. Preserve all in-page logos, navigation icons, layout, colors, and product behavior.

## Selected Approach

Use the supplied PNG as `apps/web/assets/brand/lingxi-ai-favicon.png`. Update the favicon declaration in `apps/web/app.html` from the existing SVG resource to the PNG resource and append a version query parameter so browsers do not keep showing the cached icon.

The existing SVG file remains unchanged and unused. This keeps the change reversible and avoids converting or tracing the supplied artwork.

## Files

- Replace: `apps/web/assets/brand/lingxi-ai-favicon.png`
- Update: `apps/web/app.html`
- Update test: `apps/web/tests/login-page.spec.ts`

## Rendering

The browser loads the PNG through a standard `<link rel="icon" type="image/png">` declaration. The source image is square and already sized at 256×256, so no crop, redraw, or visual transformation is required. Browser scaling handles tab-size rendering.

## Testing

Follow a red-green cycle:

1. Add an assertion that `app.html` references the versioned PNG favicon and no longer declares the SVG as the active favicon.
2. Run the focused login-page test and confirm it fails because the current HTML still references the SVG.
3. Replace the PNG and update `app.html`.
4. Re-run the focused test and confirm it passes.
5. Verify the PNG exists, is 256×256, and is served successfully by the local web server.
6. Open the application in a browser and visually confirm the new artwork appears in the browser tab without changing any in-page icon.

## Non-Goals

- No replacement of the product logo inside the page.
- No change to the SVG favicon asset.
- No changes to navigation, layout, typography, or application behavior.
- No new image-generation or image-processing step.
