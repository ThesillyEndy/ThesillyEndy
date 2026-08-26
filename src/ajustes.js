import db from "./db.js";
import { OWNERS, PREFIJO_POR_DEFECTO } from "../config.js";

const getPrefijo = db.prepare("SELECT prefijo FROM grupos WHERE jid = ?");
const setPrefijoStmt = db.prepare(`
  INSERT INTO grupos (jid, prefijo) VALUES (?, ?)
  ON CONFLICT(jid) DO UPDATE SET prefijo = excluded.prefijo
`);

export function obtenerPrefijo(jid) {
  const fila = getPrefijo.get(jid);
  return fila ? fila.prefijo : PREFIJO_POR_DEFECTO;
}

export function establecerPrefijo(jid, prefijo) {
  setPrefijoStmt.run(jid, prefijo);
}

export function esOwner(jid) {
  const numero = jid.split("@")[0]; // le quita el "@s.whatsapp.net" al jid que llega
  return OWNERS.includes(numero);
}