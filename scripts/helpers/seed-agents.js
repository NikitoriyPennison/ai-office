const fs = require('fs');
const Database = require('better-sqlite3');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const db = new Database(process.argv[3]);
const stmt = db.prepare('INSERT OR REPLACE INTO agents (id,name,emoji,role,description,position_x,position_y,current_status) VALUES (?,?,?,?,?,?,?,?)');
for (const a of config.agents) {
  stmt.run(a.id, a.name, a.emoji, a.role, a.description || '', a.position?.x || 0, a.position?.y || 0, 'offline');
}
console.log('Inserted ' + config.agents.length + ' agents');
db.close();
