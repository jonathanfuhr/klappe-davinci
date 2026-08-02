/**
 * Einstiegspunkt für Resolve.
 *
 * Resolve startet das Plugin über den <FilePath> aus der manifest.xml, npm
 * über `main` in der package.json – beide zeigen hierher. Die eigentliche
 * Logik liegt in src/, damit der Ordner nicht zur Rumpelkammer wird.
 */
require('./src/main.js');
