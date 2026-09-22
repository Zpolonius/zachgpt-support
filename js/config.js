/* Konfiguration. Rediger denne fil — resten af koden læser den herfra.
 *
 * backend:
 *   "auto"  Artifact-databasen når siden kører som Claude-artifact, ellers localStorage.
 *   "rest"  Dit eget API. Kræver at der kører en server på apiBase (se server/server.mjs).
 *   "local" Tving localStorage. Data deles ikke mellem browsere.
 */
window.ZG_CONFIG = {
  backend: "rest",
  apiBase: "/api",
  pollMs: 4000,
  storageKey: "zachgpt-support"
};
