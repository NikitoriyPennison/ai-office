const fs = require('fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const field = process.argv[3];
const val = field.split('.').reduce((o, k) => o?.[k], config);
console.log(val ?? '');
