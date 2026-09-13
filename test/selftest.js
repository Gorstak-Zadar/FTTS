/* ============================================================================
 * selftest.js — browser self-test. Runs assertions against the real loaded
 * modules and writes a summary into #selftest-out. Loaded only by test.html.
 * ==========================================================================*/
(function () {
  'use strict';
  var ENGINE = window.ENGINE, RESPONSIBILITIES = window.RESPONSIBILITIES,
      FORMATIONS = window.FORMATIONS, ROLES = window.ROLES;

  var pass = 0, fail = 0, log = [];
  function eq(name, got, want) {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; log.push('FAIL ' + name + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
  }
  function resp(flu, ment, player) { return RESPONSIBILITIES.resolve(flu, ment, player); }

  // Rule 1
  eq('rule1 4att', ENGINE.recommendedMentality(4), 'defensive');
  eq('rule1 3att', ENGINE.recommendedMentality(3), 'counter');
  eq('rule1 2att', ENGINE.recommendedMentality(2), 'standard');
  eq('rule1 1att', ENGINE.recommendedMentality(1), 'control');
  eq('rule1 0att', ENGINE.recommendedMentality(0), 'attacking');
  // Rule 2
  eq('rule2 7def', ENGINE.recommendedFluidity(7), 'highly structured');
  eq('rule2 6def', ENGINE.recommendedFluidity(6), 'structured');
  eq('rule2 5def', ENGINE.recommendedFluidity(5), 'flexible');
  eq('rule2 4def', ENGINE.recommendedFluidity(4), 'fluid');
  eq('rule2 3def', ENGINE.recommendedFluidity(3), 'very fluid');
  // Rule 4
  eq('rule4 veryfluid', ENGINE.recommendedSupportDuties('very fluid', false), { min: 0, max: 1, note: '' });
  eq('rule4 flexible', ENGINE.recommendedSupportDuties('flexible', false), { min: 4, max: 5, note: '' });
  eq('rule4 highly max', ENGINE.recommendedSupportDuties('highly structured', false).max, 9);
  eq('rule4 3cb lowers', ENGINE.recommendedSupportDuties('structured', true).max, 6);
  // Rule 5
  eq('rule5 flex centre', ENGINE.spots('flexible', 'standard').horizontalStrong, 'centre');
  eq('rule5 highly left', ENGINE.spots('highly structured', 'contain').horizontalStrong, 'left');
  eq('rule5 veryfluid right', ENGINE.spots('very fluid', 'overload').horizontalStrong, 'right');
  eq('rule5 overload ST', ENGINE.spots('flexible', 'overload').verticalStrong, 'ST');
  eq('rule5 counter CB', ENGINE.spots('flexible', 'counter').verticalStrong, 'CB');
  eq('rule5 contain GK', ENGINE.spots('flexible', 'contain').verticalStrong, 'GK');
  // Rule 6
  eq('rule6 10', ENGINE.mentalityForMinute(10), 'attacking');
  eq('rule6 30', ENGINE.mentalityForMinute(30), 'control');
  eq('rule6 50', ENGINE.mentalityForMinute(50), 'standard');
  eq('rule6 70', ENGINE.mentalityForMinute(70), 'counter');
  eq('rule6 85', ENGINE.mentalityForMinute(85), 'defensive');
  // Responsibility spot-checks
  eq('vf/contain GK', resp('very fluid', 'contain', { pos: 'GK', role: 'Goalkeeper', duty: 'Defend', lone: true }), 'Shield Goal');
  eq('vf/contain DMC', resp('very fluid', 'contain', { pos: 'DM', role: 'Defensive Midfielder', duty: 'Defend', lone: true }), 'Contain Attacking Movement');
  eq('vf/contain AMC', resp('very fluid', 'contain', { pos: 'AMC', role: 'Attacking Midfielder', duty: 'Support', lone: true }), 'Restrict Space Aggressively');
  eq('vf/contain SS', resp('very fluid', 'contain', { pos: 'AMC', role: 'Shadow Striker', duty: 'Attack', lone: true }), 'Disrupt Attacks');
  eq('vf/def Stopper', resp('very fluid', 'defensive', { pos: 'DC', role: 'Central Defender', duty: 'Stopper', lone: true }), 'Disrupt Attacks Judiciously');
  eq('vf/def Cover', resp('very fluid', 'defensive', { pos: 'DC', role: 'Central Defender', duty: 'Cover', lone: true }), 'Divert Attacking Movement');
  eq('vf/def Libero', resp('very fluid', 'defensive', { pos: 'DC', role: 'Libero', duty: 'Support', lone: true }), 'Restrict Space Cautiously');
  eq('vf/overload ST lone', resp('very fluid', 'overload', { pos: 'ST', role: 'Advanced Forward', duty: 'Attack', lone: true }), 'Bypass Last Defender');
  eq('fluid/std BBM', resp('fluid', 'standard', { pos: 'MC', role: 'Box to Box Midfielder', duty: 'Support', lone: true }), 'Keep Possession');
  eq('fluid/ctrl SK', resp('fluid', 'control', { pos: 'GK', role: 'Sweeper Keeper', duty: 'Support', lone: true }), 'Initiate Attacks');
  eq('flex/def WB defend', resp('flexible', 'defensive', { pos: 'WBL', role: 'Wing Back', duty: 'Defend', lone: true }), 'Restrict Space Aggressively');
  eq('flex/def WB support', resp('flexible', 'defensive', { pos: 'WBL', role: 'Wing Back', duty: 'Support', lone: true }), 'Disrupt Attacks Quickly');
  eq('struct/att MC', resp('structured', 'attacking', { pos: 'MC', role: 'Central Midfielder', duty: 'Support', lone: true }), 'Spearhead Attacking Moves from the Hole');
  eq('highly/overload AMC', resp('highly structured', 'overload', { pos: 'AMC', role: 'Attacking Midfielder', duty: 'Attack', lone: true }), 'Draw Off Defenders');
  // Formations
  var names = FORMATIONS.all.map(function (f) { return f.name; });
  eq('has 4-4-2', names.indexOf('4-4-2') !== -1, true);
  eq('has 4-3-3', names.indexOf('4-3-3') !== -1, true);
  eq('442 slots=11', FORMATIONS.byName['4-4-2'].slots.length, 11);
  var s442 = FORMATIONS.byName['4-4-2'].slots;
  eq('442 attackers', s442.filter(ROLES.isAttackerSlot).length, 2);
  eq('442 defenders', s442.filter(ROLES.isDefenderSlot).length, 4);
  FORMATIONS.all.forEach(function (f) {
    if (f.slots.length !== 11) { fail++; log.push('FAIL slots!=11: ' + f.name); }
    if (f.slots[0].pos !== 'GK') { fail++; log.push('FAIL no GK: ' + f.name); }
  });
  eq('formations>30', FORMATIONS.all.length > 30, true);

  var out = document.getElementById('selftest-out');
  var head = pass + ' passed, ' + fail + ' failed (' + FORMATIONS.all.length + ' formations).';
  out.innerHTML = '<h2 style="color:' + (fail ? '#e23a3a' : '#2fae60') + '">' + head + '</h2>' +
    (log.length ? '<pre>' + log.join('\n') + '</pre>' : '<p>All good.</p>');
})();
