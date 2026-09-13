/* ============================================================================
 * pitch.js
 * ----------------------------------------------------------------------------
 * Canvas 2D pitch renderer. Draws the pitch and both teams' players at their
 * formation positions, shifted vertically by mentality (how high the team
 * sits) and nudged horizontally toward the strong spot (rule 5). Each player
 * shows its position code, role short, and resolved responsibility phrase.
 *
 * Team A defends the LEFT goal and attacks RIGHT.
 * Team B defends the RIGHT goal and attacks LEFT.
 * ==========================================================================*/

(function (global) {
  'use strict';

  var E = global.ENGINE;

  // Vertical band -> base depth from own goal line (0=own goal, 1=opp goal).
  // These are the "resting" depths; mentality nudges them forward/back.
  var BAND_DEPTH = {
    GK: 0.04,
    D: 0.20,
    DM: 0.34,
    M: 0.48,
    AM: 0.66,
    ST: 0.80
  };

  // Lane -> vertical position across the pitch width (0=top, 1=bottom).
  var LANE_Y = { L: 0.14, CL: 0.34, C: 0.5, CR: 0.66, R: 0.86 };

  // Mentality shifts the whole block up/down the pitch (toward opponent goal).
  // Positive push = higher line (more attacking).
  var MENT_PUSH = {
    contain: -0.10, defensive: -0.06, counter: -0.02,
    standard: 0.0, control: 0.04, attacking: 0.08, overload: 0.12
  };

  // Horizontal strong-spot -> lane bias (shift block toward that side).
  var SPOT_BIAS = {
    'left': -0.05, 'central left': -0.025, 'centre': 0,
    'central right': 0.025, 'right': 0.05
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Short role label to keep dots readable.
  function shortRole(role) {
    var map = {
      'Goalkeeper': 'GK', 'Sweeper Keeper': 'SK',
      'Central Defender': 'CD', 'Ball Playing Defender': 'BPD',
      'No-Nonsense Centre Back': 'NCB', 'Libero': 'L', 'Sweeper': 'SW',
      'Full Back': 'FB', 'Wing Back': 'WB', 'No-Nonsense Full Back': 'NFB',
      'Inverted Full Back': 'IFB', 'Complete Wing Back': 'CWB',
      'Inverted Wing Back': 'IWB',
      'Defensive Midfielder': 'DM', 'Deep Lying Playmaker': 'DLP',
      'Half Back': 'HB', 'Anchor Man': 'AM', 'Ball Winning Midfielder': 'BWM',
      'Regista': 'RGA', 'Segundo Volante': 'SV',
      'Central Midfielder': 'CM', 'Box to Box Midfielder': 'BBM',
      'Advanced Playmaker': 'AP', 'Mezzala': 'MEZ', 'Roaming Playmaker': 'RPM',
      'Carrilero': 'CAR',
      'Winger': 'W', 'Wide Midfielder': 'WM', 'Defensive Winger': 'DW',
      'Wide Playmaker': 'WP', 'Inside Forward': 'IF', 'Inverted Winger': 'IW',
      'Raumdeuter': 'RMD',
      'Attacking Midfielder': 'AM', 'Shadow Striker': 'SS', 'Enganche': 'ENG',
      'Trequartista': 'TQ',
      'Advanced Forward': 'AF', 'Deep Lying Forward': 'DLF',
      'Complete Forward': 'CF', 'Target Forward': 'TF', 'Poacher': 'PO',
      'Pressing Forward': 'PF', 'False Nine': 'F9', 'Defensive Forward': 'DF'
    };
    return map[role] || role.slice(0, 3).toUpperCase();
  }

  function dutyShort(duty) {
    if (duty === 'Attack') return 'A';
    if (duty === 'Support') return 'S';
    if (duty === 'Defend') return 'D';
    if (duty === 'Stopper') return 'St';
    if (duty === 'Cover') return 'Co';
    return duty;
  }

  // Compute on-canvas positions for a team.
  // teamSide: 'A' (attacks right) or 'B' (attacks left).
  function layout(cfg, analysis, teamSide, W, H, margin, mentalityOverride) {
    // During a match, the shape sits according to the CURRENT effective
    // mentality (rule 6 blended), passed in as mentalityOverride.
    var push = MENT_PUSH[mentalityOverride || cfg.mentality] || 0;
    var bias = SPOT_BIAS[analysis.spot.horizontalStrong] || 0;
    var pw = W - margin * 2;
    var ph = H - margin * 2;

    return cfg.players.map(function (p, idx) {
      var depth = (BAND_DEPTH[p.band] != null ? BAND_DEPTH[p.band] : 0.5);
      if (p.pos !== 'GK') depth = clamp(depth + push, 0.06, 0.94);
      var laneY = (LANE_Y[p.lane] != null ? LANE_Y[p.lane] : 0.5);
      // Strikers stay central: compress the ST band toward the middle.
      if (p.band === 'ST') laneY = 0.5 + (laneY - 0.5) * 0.42;
      laneY = laneY + bias;
      laneY = clamp(laneY, 0.06, 0.94);

      var x, y;
      if (teamSide === 'A') {
        x = margin + depth * pw;        // depth grows to the right
        y = margin + laneY * ph;
      } else {
        x = margin + (1 - depth) * pw;  // mirrored: attacks left
        y = margin + (1 - laneY) * ph;  // mirror width too for symmetry
      }
      return {
        x: x, y: y,
        pos: p.pos, role: p.role, duty: p.duty,
        responsibility: analysis.responsibilities[idx].responsibility
      };
    });
  }

  function drawPitch(ctx, W, H, margin) {
    // Grass
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, W, H);
    // Stripes
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    var stripes = 12;
    for (var i = 0; i < stripes; i += 2) {
      ctx.fillRect(margin + (i / stripes) * (W - 2 * margin), margin,
        (W - 2 * margin) / stripes, H - 2 * margin);
    }
    // Lines
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, margin, W - 2 * margin, H - 2 * margin);
    // Halfway line
    ctx.beginPath();
    ctx.moveTo(W / 2, margin);
    ctx.lineTo(W / 2, H - margin);
    ctx.stroke();
    // Centre circle
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.09, 0, Math.PI * 2);
    ctx.stroke();
    // Penalty boxes
    var boxH = (H - 2 * margin) * 0.5;
    var boxW = (W - 2 * margin) * 0.14;
    ctx.strokeRect(margin, H / 2 - boxH / 2, boxW, boxH);
    ctx.strokeRect(W - margin - boxW, H / 2 - boxH / 2, boxW, boxH);
  }

  function drawPlayer(ctx, pl, color, showResp) {
    var r = 13;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(pl.x, pl.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.stroke();

    // Position code inside the dot
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pl.pos, pl.x, pl.y);

    // Role + duty just below
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(shortRole(pl.role) + ' (' + dutyShort(pl.duty) + ')', pl.x, pl.y + r + 8);

    // Responsibility (small, wrapped) below that
    if (showResp && pl.responsibility) {
      ctx.font = '8px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      wrapText(ctx, pl.responsibility, pl.x, pl.y + r + 19, 92, 9);
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var line = '';
    var lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], x, y + j * lineHeight);
    }
  }

  function render(canvas, teamA, analA, teamB, analB, showResp, effA, effB) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var margin = 28;

    drawPitch(ctx, W, H, margin);

    var aPlayers = layout(teamA, analA, 'A', W, H, margin, effA);
    var bPlayers = layout(teamB, analB, 'B', W, H, margin, effB);

    aPlayers.forEach(function (pl) { drawPlayer(ctx, pl, '#3b82f6', showResp); });
    bPlayers.forEach(function (pl) { drawPlayer(ctx, pl, '#ef4444', showResp); });

    // Goal-side labels
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Team A →', margin + 4, margin - 10 < 12 ? 16 : margin - 10);
    ctx.textAlign = 'right';
    ctx.fillText('← Team B', W - margin - 4, margin - 10 < 12 ? 16 : margin - 10);
  }

  global.PITCH = { render: render, shortRole: shortRole, dutyShort: dutyShort };
})(window);
