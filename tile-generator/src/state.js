// state.js — single source of truth + pub/sub

let _state = {};
const _subs = new Set();

export function get() { return _state; }

export function set(updates) {
  _state = { ..._state, ...updates };
  _notify();
}

export function merge(path, updates) {
  const keys = path.split('.');
  const root = { ..._state };
  let obj = root;
  for (let i = 0; i < keys.length - 1; i++) {
    obj[keys[i]] = { ...obj[keys[i]] };
    obj = obj[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (typeof updates === 'object' && updates !== null && !Array.isArray(updates)) {
    obj[last] = { ...obj[last], ...updates };
  } else {
    obj[last] = updates;
  }
  _state = root;
  _notify();
}

export function init(s) {
  _state = JSON.parse(JSON.stringify(s));
  _notify();
}

export function snapshot() {
  return JSON.parse(JSON.stringify(_state));
}

export function subscribe(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

function _notify() {
  _subs.forEach(fn => fn(_state));
}
