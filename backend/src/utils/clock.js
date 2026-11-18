'use strict';

/**
 * Injectable clock (design decision D4).
 * All time logic in the server calls clock.now(). Tests freeze the time with
 * clock.set(date) and restore real time with clock.reset().
 */
let fixedTime = null;

function now() {
  return fixedTime ? new Date(fixedTime.getTime()) : new Date();
}

function set(date) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('clock.set() is not allowed in production');
  }
  fixedTime = date ? new Date(date) : null;
}

function advance(ms) {
  if (!fixedTime) throw new Error('clock.advance() requires a fixed time');
  fixedTime = new Date(fixedTime.getTime() + ms);
}

function reset() {
  fixedTime = null;
}

module.exports = { now, set, advance, reset };
