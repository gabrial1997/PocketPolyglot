import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  bucketFreqBand,
  wordClassFromCandidates,
  parseComponentLemmas,
  resolveComponents,
} from './seed-content.mjs';

test('parseCsv handles quoted fields containing commas', () => {
  const rows = parseCsv('a,b,c\n1,"x, y",3\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, y', c: '3' }]);
});

test('bucketFreqBand buckets 1..1000 into 1..10', () => {
  assert.equal(bucketFreqBand(1), 1);
  assert.equal(bucketFreqBand(100), 1);
  assert.equal(bucketFreqBand(101), 2);
  assert.equal(bucketFreqBand(1000), 10);
  assert.equal(bucketFreqBand(null), null);
});

test('wordClassFromCandidates returns mapped class, defaults to function', () => {
  const map = new Map([['es', 'function'], ['kafija', 'concrete']]);
  assert.equal(wordClassFromCandidates(map, 'kafija'), 'concrete');
  assert.equal(wordClassFromCandidates(map, 'es'), 'function');
  assert.equal(wordClassFromCandidates(map, 'unknownword'), 'function');
});

test('parseComponentLemmas splits the space-separated token list', () => {
  assert.deepEqual(parseComponentLemmas('viens kafija lūdzu'), ['viens', 'kafija', 'lūdzu']);
  assert.deepEqual(parseComponentLemmas(''), []);
});

test('resolveComponents maps tokens to lemma ids by position, skips unknowns', () => {
  const byLemma = new Map([['viens', 'id-v'], ['kafija', 'id-k']]);
  const out = resolveComponents('viens kafija zzz', byLemma);
  assert.deepEqual(out, [
    { lemma: 'viens', lemma_id: 'id-v', position: 0 },
    { lemma: 'kafija', lemma_id: 'id-k', position: 1 },
  ]);
});
