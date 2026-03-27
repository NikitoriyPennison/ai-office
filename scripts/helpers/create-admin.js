const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const db = new Database(process.argv[2]);
const id = randomUUID();
const hash = bcrypt.hashSync(process.argv[4], 10);
db.prepare('INSERT OR REPLACE INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(id, process.argv[3], hash, 'admin');
console.log('Admin created: ' + process.argv[3]);
db.close();
