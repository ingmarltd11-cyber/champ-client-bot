const fs = require('fs');
const path = require('path');

function readJSON(relativePath) {
  const fullPath = path.join(__dirname, '..', '..', relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

// Config wordt elke keer vers van schijf gelezen, dus wijzigingen in
// config/*.json werken direct (bot herstarten is niet nodig).
module.exports = {
  getServerStructure: () => readJSON('config/server-structure.json'),
  getTicketConfig: () => readJSON('config/tickets.json'),
  getRolesConfig: () => readJSON('config/roles.json'),
};
