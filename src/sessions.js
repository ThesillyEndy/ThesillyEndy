 import db from "./db.js";

const obtener = db.prepare(
  "SELECT datos FROM sesiones WHERE jid = ? AND expira > ?"
);
const guardar = db.prepare(`
  INSERT INTO sesiones (jid, datos, expira) VALUES (?, ?, ?)
  ON CONFLICT(jid) DO UPDATE SET datos = excluded.datos, expira = excluded.expira
`);
const borrarExpiradas = db.prepare("DELETE FROM sesiones WHERE expira <= ?");

export function getSesion(jid) {
  const fila = obtener.get(jid, Date.now());
  return fila ? JSON.parse(fila.datos) : null;
}

export function setSesion(jid, datos, segundosVida = 300) {
  guardar.run(jid, JSON.stringify(datos), Date.now() + segundosVida * 1000);
}

export function limpiarSesiones() {
  borrarExpiradas.run(Date.now());
}