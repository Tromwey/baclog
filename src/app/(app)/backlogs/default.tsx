/**
 * Fallback for the implicit `children` slot next to @modal. When a soft nav
 * from OUTSIDE /backlogs triggers the (.)[backlogId] interception, Next can't
 * recover the children slot's active state and renders this default — without
 * it, that nav 404s (see next docs: parallel-routes › default.js). The
 * intercepted overlay is opaque, but rendering the real shelves list keeps the
 * layer underneath valid once the overlay is dismissed.
 */
export { default } from "./page";
