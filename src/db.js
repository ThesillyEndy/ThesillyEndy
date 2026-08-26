import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const carpetaDatos = path.join(process.cwd(), "datos");

if (!fs.existsSync(carpetaDatos)) {
  fs.mkdirSync(carpetaDatos);
}

const db = new Database(path.join(carpetaDatos, "bot.db"));

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS auth_creds (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_keys (
    type TEXT NOT NULL,
    key_id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (type, key_id)
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    jid TEXT PRIMARY KEY,
    datos TEXT NOT NULL,
    expira INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jid_map (
    lid TEXT PRIMARY KEY,
    jid_real TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS grupos (
    jid TEXT PRIMARY KEY,
    prefijo TEXT NOT NULL
  );
`);

export default db;