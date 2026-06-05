# Admin Static Page Placement

## Decision

Put the standalone admin management static page under:

```text
apps/admin/
  index.html
  styles.css
  main.js
  assets/
```

The admin page must be treated as a separate static application from `apps/web`.

## Rationale

- `apps/web` is the creator-facing web app. It contains the login page, creator workbench, production workflow, team library, and related browser tests.
- The admin page requested here is a generic management backend prototype/static page, not part of the current creator workflow.
- Keeping it in `apps/admin` prevents accidental coupling to `apps/web/app.html`, `apps/web/app.js`, creator API bootstrap logic, existing feature renderers, or creator-facing CSS.
- The repository already groups runnable applications under `apps/`, so `apps/admin` is clearer than a root-level `admin/` folder.

## Boundaries

The static admin page should not:

- Import or modify files under `apps/web/src/`.
- Reuse `apps/web/app.html` or mount into `#creator-app`.
- Depend on `creatorApi`, login session bootstrap, or current creator routes.
- Share global CSS with `apps/web` unless a later architecture decision explicitly introduces shared design tokens.

The static admin page may:

- Use plain HTML, CSS, and vanilla JavaScript ES modules.
- Use mock data for dashboard cards, tables, filters, and status views.
- Be opened directly from the filesystem during design review:

```text
file:///D:/Claudecode/AIProject/comic_ai/apps/admin/index.html
```

## Future Evolution

If the admin page later becomes a real connected application, keep the same `apps/admin` boundary and add its own build tooling, tests, API client, and routing inside that directory. Any integration with backend admin APIs should be documented separately before wiring it into production operations.
