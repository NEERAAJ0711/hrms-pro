---
name: EPFO/ESIC TS fix patterns
description: Patterns that cleared all TypeScript errors in epfo-esic-routes.ts (1800 lines)
---

## Rule
In Express + Drizzle routes: three classes of errors require specific fixes.

**req.params cast:** `req.params.id` is typed `string | string[]` in this Express version. Fix: `const id = req.params.id as string` (never destructure `const { id } = req.params`).

**parseQuery generic:** Change `z.ZodSchema<T>` to `z.ZodTypeAny` with return type `z.output<S>`. This fixes `number | undefined` not assignable errors from optional number params.

**Drizzle .set() typed update:** Avoid `Record<string, unknown>` for `.set()`. Use a typed object literal: `const set: { field?: type; requiredField: type } = { ... }` then call `.set(set)`.

**Drizzle .insert().values() nullable columns:** Don't pass `null` for nullable columns — Drizzle's insert type expects `undefined` (or cast `as any` for the whole values object). Returning after insert requires a separate `.select()` query since some Drizzle versions/setups don't support `.returning()` cleanly.

**Why:** This Drizzle version (inferred from errors) uses strict union types that exclude `null` from column insert types for some column variants.
