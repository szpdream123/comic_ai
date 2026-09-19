# New canvas hover tooltip delay

**Date:** 2026-09-18
**Status:** DONE

## Symptom

Hovering a selected-node toolbar action in the new canvas (for example `清除空行`) waited too long before the bubble appeared.

## Root cause

`useTooltipAutoPlacement` scheduled the tooltip open with `Zd=800`, so `pointerover` waited 800ms before setting `data-open`. Brand CSS already removed the visual transition, so the remaining delay was this JS timer.

## Fix

- `apps/web/ai-canvas-runtime/assets/useTooltipAutoPlacement-C_fDN_J5.js`: `Zd=800` → `Zd=0`.

## Evidence

- `node --test --test-name-pattern "canvas hover tooltips open immediately" apps/web/tests/new-canvas-host.spec.mjs`

## Regression test

- `apps/web/tests/new-canvas-host.spec.mjs`
