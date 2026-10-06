import test from 'node:test';
import assert from 'node:assert/strict';
import { t, useDictionary } from '../client/i18n.js';
import tr from '../client/i18n/tr.js';
import es from '../client/i18n/es.js';

test('Turkish: exact, icons, punctuation, patterns and joined strings', () => {
  useDictionary('tr', tr);
  assert.equal(t('Find Match'), 'Maç Bul');
  assert.equal(t('⚙️ Settings'), '⚙️ Ayarlar');
  assert.equal(t('Loading…'), 'Yükleniyor…');
  assert.equal(t('Day 1 login streak: +25 shards!'), '1. gün giriş serisi: +25 kristal!');
  assert.equal(t('HP 650 · Mana 280 · AD 62 · Armor 37 · AS 0.66 · Range 1.7'), 'Can 650 · Mana 280 · SG 62 · Zırh 37 · SH 0.66 · Menzil 1.7');
  assert.equal(t('Tank · Melee · Top / Support'), 'Tank · Yakın dövüş · Üst / Destek');
  assert.equal(t('Rank 0/5 · Cooldown 8/7.5/7/6.5/6s · Mana 60/65'), 'Seviye 0/5 · Bekleme 8/7.5/7/6.5/6s · Mana 60/65');
  assert.equal(t('0 / 550 XP to level 2'), '2. seviyeye 0 / 550 TP');
  assert.equal(t('peak Silver II'), 'en yüksek Gümüş II');
  assert.equal(t('Mend: Heals you and the most injured nearby ally, and grants a burst of movement speed.'), 'Mend: Seni ve yakındaki en yaralı müttefiki iyileştirir ve kısa süreli hareket hızı verir.');
  assert.equal(t('Boulder Toss'), 'Boulder Toss', 'proper names stay');
  assert.equal(t('team chat · /all · /ff'), 'takım sohbeti · /all · /ff', 'chat commands stay');
});

test('Spanish covers the same keys as Turkish', () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(tr).sort());
  useDictionary('es', es);
  assert.equal(t('Brawl 5v5'), 'Reyerta 5v5');
  assert.equal(t('Ready for the Valley?'), '¿Listo para el Valle?');
  assert.equal(t('Step 2 of 8'), 'Paso 2 de 8');
  useDictionary('en', {});
});
