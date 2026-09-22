/* Konfiguration. Rediger denne fil — resten af koden læser den herfra.
 *
 * backend:
 *   "auto"  Finder selv ud af det: artifact-databasen hvis siden kører som
 *           Claude-artifact, ellers dit eget API på apiBase hvis det svarer,
 *           ellers localStorage. Den samme fil virker dermed alle tre steder,
 *           og du behøver ikke rette her før et deploy.
 *   "rest"  Tving dit eget API. Fejler hvis der ikke er noget på apiBase.
 *   "local" Tving localStorage. Data deles ikke mellem browsere.
 */
window.ZG_CONFIG = {
  backend: "rest",
  apiBase: "/api",
  pollMs: 4000,
  storageKey: "zachgpt-support"
};
