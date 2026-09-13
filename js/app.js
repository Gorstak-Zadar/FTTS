/* ============================================================================
 * app.js
 * ----------------------------------------------------------------------------
 * UI wiring: builds the two team panels (formation / fluidity / mentality +
 * per-player role & duty), renders advisories, and drives the pitch canvas.
 * ==========================================================================*/

(function (global) {
  'use strict';

  var F = global.FORMATIONS;
  var R = global.ROLES;
  var E = global.ENGINE;
  var PITCH = global.PITCH;

  // Team state.
  function makeTeam(defaultFormation, home) {
    var slots = F.slotsOf(defaultFormation);
    return {
      formationName: defaultFormation,
      fluidity: 'flexible',
      mentality: 'standard',
      home: home,
      players: slots.map(function (s) {
        var rd = R.defaultRoleDuty(s.pos);
        return { pos: s.pos, lane: s.lane, band: s.band, role: rd.role, duty: rd.duty };
      })
    };
  }

  var teamA = makeTeam('4-4-2', true);
  var teamB = makeTeam('4-3-3', false);

  var options = { badWeather: false };

  // ---- DOM helpers -----------------------------------------------------------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function option(value, label, selected) {
    var o = el('option', { value: value });
    o.textContent = label || value;
    if (selected) o.selected = true;
    return o;
  }

  // ---- Build formation <select> with optgroups -------------------------------
  function buildFormationSelect(team, onChange) {
    var sel = el('select', { class: 'sel-formation' });
    F.grouped().forEach(function (group) {
      var og = el('optgroup', { label: group.label });
      group.formations.forEach(function (f) {
        og.appendChild(option(f.name, f.name, f.name === team.formationName));
      });
      sel.appendChild(og);
    });
    sel.addEventListener('change', function () {
      team.formationName = sel.value;
      var slots = F.slotsOf(team.formationName);
      team.players = slots.map(function (s) {
        var rd = R.defaultRoleDuty(s.pos);
        return { pos: s.pos, lane: s.lane, band: s.band, role: rd.role, duty: rd.duty };
      });
      onChange(true);
    });
    return sel;
  }

  function buildSimpleSelect(cls, values, current, onPick) {
    var sel = el('select', { class: cls });
    values.forEach(function (v) {
      sel.appendChild(option(v, capitalize(v), v === current));
    });
    sel.addEventListener('change', function () { onPick(sel.value); });
    return sel;
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- Per-player role & duty rows ------------------------------------------
  function buildPlayerRows(team, onChange) {
    var wrap = el('div', { class: 'player-rows' });
    team.players.forEach(function (p, idx) {
      var row = el('div', { class: 'player-row' });
      row.appendChild(el('span', { class: 'pos-badge', text: p.pos }));

      // Role select
      var roleSel = el('select', { class: 'sel-role' });
      var roleOpts = R.rolesForPos(p.pos);
      roleOpts.forEach(function (ro) {
        roleSel.appendChild(option(ro.role, ro.role, ro.role === p.role));
      });

      // Duty select (depends on role)
      var dutySel = el('select', { class: 'sel-duty' });
      function refreshDuties() {
        dutySel.innerHTML = '';
        var current = roleOpts.filter(function (ro) { return ro.role === p.role; })[0];
        var duties = current ? current.duties : ['Support'];
        if (duties.indexOf(p.duty) === -1) p.duty = duties[0];
        duties.forEach(function (d) {
          dutySel.appendChild(option(d, d, d === p.duty));
        });
      }
      refreshDuties();

      roleSel.addEventListener('change', function () {
        p.role = roleSel.value;
        refreshDuties();
        onChange(false);
      });
      dutySel.addEventListener('change', function () {
        p.duty = dutySel.value;
        onChange(false);
      });

      row.appendChild(roleSel);
      row.appendChild(dutySel);
      wrap.appendChild(row);
    });
    return wrap;
  }

  // ---- Advisory / analysis panel --------------------------------------------
  function buildAnalysis(team, analysis) {
    var box = el('div', { class: 'analysis' });

    function line(label, value, cls) {
      var d = el('div', { class: 'aline ' + (cls || '') });
      d.appendChild(el('span', { class: 'alabel', text: label }));
      d.appendChild(el('span', { class: 'avalue', text: value }));
      return d;
    }

    box.appendChild(line('Attackers (W/AMC/ST)', String(analysis.attackerCount)));
    box.appendChild(line('Defenders (CB/FB/WB/DM)', String(analysis.defenderCount)));
    box.appendChild(line('Rule 1 → mentality', analysis.recommendedMentality));
    box.appendChild(line('Rule 2 → fluidity', analysis.recommendedFluidity));
    box.appendChild(line('Fluidity means', analysis.fluidityMeaning || '—'));
    var sup = analysis.supportDutyRange;
    box.appendChild(line('Rule 4 → support duties',
      (sup.min === sup.max ? sup.min : sup.min + '-' + sup.max) +
      ' (you have ' + analysis.actualSupportDuties + ')'));
    box.appendChild(line('Strong spot',
      analysis.spot.horizontalStrong + ' / ' + analysis.spot.verticalStrong));
    box.appendChild(line('Weak spot',
      analysis.spot.horizontalWeak + ' / ' + analysis.spot.verticalWeak));

    if (analysis.advisories.length) {
      box.appendChild(el('div', { class: 'sub', text: 'Advisories' }));
      analysis.advisories.forEach(function (a) {
        box.appendChild(el('div', { class: 'advisory', text: a }));
      });
    }
    if (analysis.warnings.length) {
      box.appendChild(el('div', { class: 'sub', text: 'Warnings (rule 7)' }));
      analysis.warnings.forEach(function (w) {
        box.appendChild(el('div', { class: 'warn warn-' + w.level, text: w.text }));
      });
    }
    return box;
  }

  // ---- Mentality timeline (rule 6) ------------------------------------------
  function buildTimeline() {
    var box = el('div', { class: 'timeline' });
    box.appendChild(el('div', { class: 'sub', text: 'Rule 6 — mentality efficiency by minute' }));
    var strip = el('div', { class: 'tl-strip' });
    E.MENTALITY_TIMELINE.forEach(function (seg) {
      var cell = el('div', { class: 'tl-cell tl-' + seg.mentality });
      cell.appendChild(el('div', { class: 'tl-min', text: seg.from + '–' + seg.to + "'" }));
      cell.appendChild(el('div', { class: 'tl-ment', text: capitalize(seg.mentality) }));
      strip.appendChild(cell);
    });
    box.appendChild(strip);
    return box;
  }

  // ---- Panel builder ---------------------------------------------------------
  function buildPanel(containerId, team, label) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';

    var head = el('div', { class: 'panel-head' });
    head.appendChild(el('h2', { text: label }));
    container.appendChild(head);

    var controls = el('div', { class: 'controls' });

    var fRow = el('div', { class: 'ctrl-row' });
    fRow.appendChild(el('label', { text: 'Formation' }));
    fRow.appendChild(buildFormationSelect(team, refresh));
    controls.appendChild(fRow);

    var flRow = el('div', { class: 'ctrl-row' });
    flRow.appendChild(el('label', { text: 'Fluidity' }));
    flRow.appendChild(buildSimpleSelect('sel-fluidity', R.FLUIDITIES, team.fluidity,
      function (v) { team.fluidity = v; refresh(false); }));
    controls.appendChild(flRow);

    var mRow = el('div', { class: 'ctrl-row' });
    mRow.appendChild(el('label', { text: 'Mentality' }));
    mRow.appendChild(buildSimpleSelect('sel-mentality', R.MENTALITIES, team.mentality,
      function (v) { team.mentality = v; refresh(false); }));
    controls.appendChild(mRow);

    container.appendChild(controls);

    container.appendChild(el('div', { class: 'sub', text: 'Players — role & duty' }));
    container.appendChild(buildPlayerRows(team, refresh));

    // analysis placeholder (filled by refresh)
    var analysisHost = el('div', { class: 'analysis-host', id: containerId + '-analysis' });
    container.appendChild(analysisHost);
  }

  // ---- Full refresh ----------------------------------------------------------
  var canvas;

  function refresh(structuralChange) {
    if (structuralChange) {
      // Rebuild player rows (formation changed) — rebuild whole panels.
      buildPanel('panelA', teamA, 'Team A (home)');
      buildPanel('panelB', teamB, 'Team B (away)');
    }

    var sameOpp = E.isSame(teamA, teamB);
    var optsA = { sameAsOpponent: sameOpp, badWeather: options.badWeather };
    var optsB = { sameAsOpponent: sameOpp, badWeather: options.badWeather };

    var analA = E.analyseTeam(teamA, optsA);
    var analB = E.analyseTeam(teamB, optsB);

    // Fill analysis hosts.
    var hostA = document.getElementById('panelA-analysis');
    var hostB = document.getElementById('panelB-analysis');
    if (hostA) { hostA.innerHTML = ''; hostA.appendChild(buildAnalysis(teamA, analA)); }
    if (hostB) { hostB.innerHTML = ''; hostB.appendChild(buildAnalysis(teamB, analB)); }

    // Render pitch.
    var showResp = document.getElementById('toggleResp').checked;
    PITCH.render(canvas, teamA, analA, teamB, analB, showResp);
  }

  // ---- Init ------------------------------------------------------------------
  function init() {
    canvas = document.getElementById('pitch');

    // Weather toggle & responsibility toggle.
    document.getElementById('toggleWeather').addEventListener('change', function (e) {
      options.badWeather = e.target.checked;
      refresh(false);
    });
    document.getElementById('toggleResp').addEventListener('change', function () {
      refresh(false);
    });

    // Mentality timeline (shared, rule 6).
    document.getElementById('timeline').appendChild(buildTimeline());

    buildPanel('panelA', teamA, 'Team A (home)');
    buildPanel('panelB', teamB, 'Team B (away)');
    refresh(false);
  }

  global.addEventListener('DOMContentLoaded', init);
})(window);
