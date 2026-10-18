const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

// Every .js file in src/commands must export { data, execute }.
function loadCommands() {
  return fs
    .readdirSync(COMMANDS_DIR)
    .filter((file) => file.endsWith('.js'))
    .map((file) => require(path.join(COMMANDS_DIR, file)));
}

module.exports = { loadCommands };
