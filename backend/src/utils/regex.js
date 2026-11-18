'use strict';

/** Escapes user input so it is matched literally inside a RegExp. */
function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(input) {
  return new RegExp(escapeRegex(input), 'i');
}

module.exports = { escapeRegex, containsRegex };
