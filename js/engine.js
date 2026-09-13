/* ============================================================================
 * engine.js
 * ----------------------------------------------------------------------------
 * The rules engine. Pure functions that apply the guide (rules 1-7) to a team
 * configuration and produce recommendations, strong/weak spot, per-minute
 * mentality plan, per-player responsibilities, and warnings.
 *
 * A team config:
 *   {
 *     formationName: '4-4-2',
 *     fluidity: 'flexible',
 *     mentality: 'standard',
 *     players: [ { pos, lane, band, role, duty }, ... ]  // parallel to slots
 *     home: true/false
 *   }
 * ==========================================================================*/

(function (global) {
  'use strict';

  var R = global.ROLES;
  var RESP = global.RESPONSIBILITIES;

  // ---- RULE 1: recommended mentality from attacker count ---------------------
  // 4 attackers=defensive, 3=counter, 2=standard, 1=control, 0=attacking.
  function recommendedMentality(attackerCount) {
    switch (attackerCount) {
      case 4: return 'defensive';
      case 3: return 'counter';
      case 2: return 'standard';
      case 1: return 'control';
      case 0: return 'attacking';
      default:
        // 5+ attackers: extend the trend one step more attacking than 0? The
        // guide only covers 0-4; clamp sensibly toward attacking.
        return attackerCount > 4 ? 'defensive' : 'attacking';
    }
  }

  // ---- RULE 2: recommended fluidity from defender count ----------------------
  // 7=highly structured, 6=structured, 5=flexible, 4=fluid, 3=very fluid.
  function recommendedFluidity(defenderCount) {
    switch (defenderCount) {
      case 7: return 'highly structured';
      case 6: return 'structured';
      case 5: return 'flexible';
      case 4: return 'fluid';
      case 3: return 'very fluid';
      default:
        if (defenderCount >= 7) return 'highly structured';
        if (defenderCount <= 3) return 'very fluid';
        return 'flexible';
    }
  }

  // ---- RULE 3: fluidity meaning (informational) ------------------------------
  var FLUIDITY_MEANING = {
    'highly structured': 'players play assigned roles',
    'structured': 'players play assigned roles and duties',
    'flexible': 'players play assigned duties, but can bypass role',
    'fluid': 'players can bypass role and duty',
    'very fluid': 'players can bypass role and duty and mentality'
  };

  // ---- RULE 4: recommended number of support duties from fluidity ------------
  // (lower figure if 3 CBs). Returns a {min,max} range and a note.
  function recommendedSupportDuties(fluidity, threeCentreBacks) {
    var base = {
      'very fluid': [0, 1],
      'fluid': [2, 3],
      'flexible': [4, 5],
      'structured': [6, 7],
      'highly structured': [8, 9]
    }[fluidity] || [4, 5];
    var min = base[0], max = base[1];
    var note = '';
    if (threeCentreBacks) {
      // "lower figure if 3 CB's" -> lean to the lower bound.
      max = min;
      note = 'Using the lower figure because of 3 centre-backs.';
    }
    return { min: min, max: max, note: note };
  }

  // ---- RULE 5: strong spot / weak spot ---------------------------------------
  // Strong spot has two mappings in the guide: one by fluidity (horizontal),
  // one by mentality (vertical band). We surface both.
  var FLUIDITY_SPOT = {
    'highly structured': 'left',
    'structured': 'central left',
    'flexible': 'centre',
    'fluid': 'central right',
    'very fluid': 'right'
  };
  var FLUIDITY_SPOT_OPPOSITE = {
    'left': 'right',
    'central left': 'central right',
    'centre': 'centre',
    'central right': 'central left',
    'right': 'left'
  };
  // Mentality -> vertical strong band (guide rule 5 second list).
  var MENTALITY_SPOT = {
    'overload': 'ST',
    'attacking': 'AMC',
    'control': 'MC',
    'standard': 'DM',
    'counter': 'CB',
    'defensive': 'SW',
    'contain': 'GK'
  };
  // Opposite vertical band (weak spot) - invert along the spine.
  var MENTALITY_SPOT_OPPOSITE = {
    'ST': 'GK',
    'AMC': 'SW',
    'MC': 'CB',
    'DM': 'DM',
    'CB': 'MC',
    'SW': 'AMC',
    'GK': 'ST'
  };

  function spots(fluidity, mentality) {
    var hStrong = FLUIDITY_SPOT[fluidity] || 'centre';
    var vStrong = MENTALITY_SPOT[mentality] || 'MC';
    return {
      horizontalStrong: hStrong,
      horizontalWeak: FLUIDITY_SPOT_OPPOSITE[hStrong] || 'centre',
      verticalStrong: vStrong,
      verticalWeak: MENTALITY_SPOT_OPPOSITE[vStrong] || 'MC'
    };
  }

  // ---- RULE 6: mentality efficiency by match minute --------------------------
  // 1-20 attacking, 20-40 control, 40-60 standard, 60-80 counter, 80-end defensive
  var MENTALITY_TIMELINE = [
    { from: 1, to: 20, mentality: 'attacking' },
    { from: 20, to: 40, mentality: 'control' },
    { from: 40, to: 60, mentality: 'standard' },
    { from: 60, to: 80, mentality: 'counter' },
    { from: 80, to: 90, mentality: 'defensive' }
  ];
  function mentalityForMinute(minute) {
    for (var i = 0; i < MENTALITY_TIMELINE.length; i++) {
      var seg = MENTALITY_TIMELINE[i];
      if (minute >= seg.from && minute <= seg.to) return seg.mentality;
    }
    return minute > 90 ? 'defensive' : 'attacking';
  }

  // A rough ordering used to compare "how attacking" two mentalities are.
  var MENT_LEVEL = {
    contain: 0, defensive: 1, counter: 2, standard: 3,
    control: 4, attacking: 5, overload: 6
  };
  var FLUID_LEVEL = {
    'highly structured': 0, 'structured': 1, 'flexible': 2,
    'fluid': 3, 'very fluid': 4
  };

  // ---- RULE 7: warnings ------------------------------------------------------
  function warnings(cfg, opts) {
    opts = opts || {};
    var w = [];
    // 7a: attacking mentality => weak spot is defense.
    if (cfg.mentality === 'attacking' || cfg.mentality === 'overload') {
      w.push({ level: 'caution', text:
        'Attacking mentality leaves your defence as the weak spot; consider whether you want to play this aggressively.' });
    }
    // 7b: mentality higher than fluidity => cards/injuries.
    // Compare the "aggressiveness" of mentality vs the "freedom" of fluidity.
    // Guide phrasing: if mentality is higher than fluidity. We map both onto a
    // 0..6 / 0..4 scale and normalise fluidity to the mentality scale.
    var mLvl = MENT_LEVEL[cfg.mentality];
    var fLvlNorm = (FLUID_LEVEL[cfg.fluidity] / 4) * 6;
    if (mLvl > fLvlNorm) {
      w.push({ level: 'risk', text:
        'Mentality is higher than fluidity — players are more likely to pick up cards or get injured.' });
    }
    // 7c: more structured => bad decisions.
    if (cfg.fluidity === 'structured' || cfg.fluidity === 'highly structured') {
      w.push({ level: 'info', text:
        'More structured fluidity means players make worse individual decisions.' });
    }
    // 7g: more defensive => fewer shots, need better finishing.
    if (mLvl <= MENT_LEVEL.counter) {
      w.push({ level: 'info', text:
        'Playing more defensively reduces your shots — you will need better finishing.' });
    }
    // 7h: more fluid and more defensive => better form.
    if (FLUID_LEVEL[cfg.fluidity] >= FLUID_LEVEL['fluid'] && mLvl <= MENT_LEVEL.counter) {
      w.push({ level: 'good', text:
        'More fluid and more defensive tends to yield better form.' });
    }
    // 7d: both teams same => aggressive favors home, defensive favors away.
    if (opts.sameAsOpponent) {
      if (mLvl >= MENT_LEVEL.control) {
        w.push({ level: 'info', text:
          'Both teams play alike and this is an aggressive tactic — favours the home team.' });
      } else {
        w.push({ level: 'info', text:
          'Both teams play alike and this is a defensive tactic — favours the away team.' });
      }
    }
    // 7e: bad weather favors more aggressive mentality.
    if (opts.badWeather && mLvl < MENT_LEVEL.control) {
      w.push({ level: 'info', text:
        'Bad weather favours a more aggressive mentality than you have set.' });
    }
    return w;
  }

  // ---- Support-duty counting (actual, from player choices) -------------------
  function countSupportDuties(players) {
    return players.filter(function (p) { return p.duty === 'Support'; }).length;
  }

  function countThreeCentreBacks(players) {
    return players.filter(function (p) {
      return p.pos === 'DC';
    }).length === 3;
  }

  // Number of strikers (ST band) determines lone vs multiple for the tables.
  function strikerCount(players) {
    return players.filter(function (p) { return p.pos === 'ST'; }).length;
  }

  // ---- Resolve responsibilities for every player -----------------------------
  function resolveResponsibilities(cfg) {
    var lone = strikerCount(cfg.players) === 1;
    return cfg.players.map(function (p) {
      var phrase = RESP.resolve(cfg.fluidity, cfg.mentality, {
        pos: p.pos,
        role: p.role,
        duty: p.duty,
        lone: lone
      });
      return {
        pos: p.pos,
        role: p.role,
        duty: p.duty,
        responsibility: phrase || '(no specific instruction)'
      };
    });
  }

  // ---- Full analysis for one team --------------------------------------------
  function analyseTeam(cfg, opts) {
    var slots = cfg.players;
    var attackerCount = slots.filter(R.isAttackerSlot).length;
    var defenderCount = slots.filter(R.isDefenderSlot).length;
    var threeCB = countThreeCentreBacks(slots);

    var recMent = recommendedMentality(attackerCount);
    var recFlu = recommendedFluidity(defenderCount);
    var supRange = recommendedSupportDuties(cfg.fluidity, threeCB);
    var actualSupport = countSupportDuties(slots);
    var spot = spots(cfg.fluidity, cfg.mentality);

    var extraWarnings = warnings(cfg, opts);

    // Advisory: mentality/fluidity deviate from recommendation?
    var advisories = [];
    if (cfg.mentality !== recMent) {
      advisories.push('Rule 1 suggests "' + recMent + '" mentality for ' +
        attackerCount + ' attacker(s); you picked "' + cfg.mentality + '".');
    }
    if (cfg.fluidity !== recFlu) {
      advisories.push('Rule 2 suggests "' + recFlu + '" fluidity for ' +
        defenderCount + ' defender(s); you picked "' + cfg.fluidity + '".');
    }
    if (actualSupport < supRange.min || actualSupport > supRange.max) {
      advisories.push('Rule 4 suggests ' + supRange.min +
        (supRange.max !== supRange.min ? '-' + supRange.max : '') +
        ' support duties for "' + cfg.fluidity + '"; you have ' + actualSupport + '.'
        + (supRange.note ? ' ' + supRange.note : ''));
    }

    return {
      attackerCount: attackerCount,
      defenderCount: defenderCount,
      threeCentreBacks: threeCB,
      recommendedMentality: recMent,
      recommendedFluidity: recFlu,
      fluidityMeaning: FLUIDITY_MEANING[cfg.fluidity],
      supportDutyRange: supRange,
      actualSupportDuties: actualSupport,
      spot: spot,
      responsibilities: resolveResponsibilities(cfg),
      advisories: advisories,
      warnings: extraWarnings
    };
  }

  // Compare two teams to detect the rule-7d "both teams play the same" case.
  function isSame(a, b) {
    return a.formationName === b.formationName &&
      a.fluidity === b.fluidity &&
      a.mentality === b.mentality;
  }

  global.ENGINE = {
    recommendedMentality: recommendedMentality,
    recommendedFluidity: recommendedFluidity,
    recommendedSupportDuties: recommendedSupportDuties,
    FLUIDITY_MEANING: FLUIDITY_MEANING,
    spots: spots,
    mentalityForMinute: mentalityForMinute,
    MENTALITY_TIMELINE: MENTALITY_TIMELINE,
    warnings: warnings,
    analyseTeam: analyseTeam,
    isSame: isSame,
    MENT_LEVEL: MENT_LEVEL,
    FLUID_LEVEL: FLUID_LEVEL
  };
})(window);
