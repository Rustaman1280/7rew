const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
const timerCode = html.split('// === Timer ===')[1]?.split('// === Settings ===')[0];
assert.ok(timerCode, 'the timer section must exist');

function timer(seconds = 3) {
  let now = 0;
  let alarmCount = 0;
  let nextId = 1;
  const intervals = new Map();
  const elements = Object.fromEntries(
    ['t-display', 't-min', 't-sec', 't-start', 't-stop', 't-reset'].map(id => [id, { value: '0', textContent: '' }]),
  );
  elements['t-sec'].value = String(seconds);
  class AudioContext {
    currentTime = 0;
    destination = {};
    createOscillator() {
      return { connect() {}, frequency: {}, start() { alarmCount++; }, stop() {} };
    }
    createGain() {
      return { connect() {}, gain: { exponentialRampToValueAtTime() {} } };
    }
  }
  vm.runInNewContext(timerCode, {
    document: { getElementById: id => elements[id] },
    window: { AudioContext },
    performance: { now: () => now },
    fmt: n => String(n).padStart(2, '0'),
    setInterval: callback => { const id = nextId++; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id),
  });
  return {
    click: id => elements[id].onclick(),
    display: () => elements['t-display'].textContent,
    intervalCount: () => intervals.size,
    alarms: () => alarmCount,
    advance: milliseconds => {
      now += milliseconds;
      for (const callback of [...intervals.values()]) callback();
    },
  };
}

test('counts down normally without creating duplicate intervals', () => {
  const t = timer();
  t.click('t-start');
  t.click('t-start');
  assert.equal(t.intervalCount(), 1);
  assert.equal(t.display(), '00:03');
  t.advance(1000);
  assert.equal(t.display(), '00:02');
});

test('uses elapsed time when a browser callback is delayed', () => {
  const t = timer();
  t.click('t-start');
  t.advance(2500);
  assert.equal(t.display(), '00:01');
  assert.equal(t.alarms(), 0);
});

test('expires at zero and rings once after a long callback delay', () => {
  const t = timer();
  t.click('t-start');
  t.advance(10000);
  assert.equal(t.display(), '00:00');
  assert.equal(t.intervalCount(), 0);
  assert.equal(t.alarms(), 1);
  t.advance(1000);
  assert.equal(t.alarms(), 1);
});

test('stop and reset still cancel the countdown', () => {
  const t = timer();
  t.click('t-start');
  t.advance(1000);
  t.click('t-stop');
  t.advance(5000);
  assert.equal(t.display(), '00:02');
  assert.equal(t.alarms(), 0);
  assert.equal(t.intervalCount(), 0);
  t.click('t-start');
  t.click('t-reset');
  t.advance(5000);
  assert.equal(t.display(), '00:30');
  assert.equal(t.intervalCount(), 0);
  assert.equal(t.alarms(), 0);
});
