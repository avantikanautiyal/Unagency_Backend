// Deployment inventory validation helpers.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

module.exports = { ROOT, exists, read };
