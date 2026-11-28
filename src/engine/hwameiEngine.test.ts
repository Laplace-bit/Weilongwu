import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AvianRepertoireGrammar,
  AvianSongDirector,
  CHINESE_HWAMEI_PROFILE,
  HWAMEI_ORGAN,
  HwameiSongController,
  LINGNAN_BULBUL_PROFILE,
  MOUNTAIN_THRUSH_PROFILE,
  MotifMutator,
  PitchContourEvaluator,
  evaluateHwameiCircadianActivity,
  solveSpeciesOec,
  solveSpeciesTension,
  type AvianMotif,
  type AvianSyllable,
  type MotifTransformKind,
  type SyllableOrnamentKind,
} from './hwameiSongEngine';
import { createSeededRng, evaluatePasserineCircadianSchedule } from './avianSongArchitecture';
import {
  computeHwameiSpatialAcoustics,
  countAcousticWallCrossings,
} from './hwameiAcoustics';

test('solveSpeciesTension & solveSpeciesOec remain finite and monotonic across Hwamei vocal range', () => {
  const freqs = [1200, 1800, 2500, 3400, 4600];
  let prevTenL = -Infinity;
  let prevTenR = -Infinity;
  let prevOec = Infinity;

  for (const f of freqs) {
    const tenL = solveSpeciesTension(f, 'L', HWAMEI_ORGAN);
    const tenR = solveSpeciesTension(f, 'R', HWAMEI_ORGAN);
    const { oecVolMl, beakGapeMm } = solveSpeciesOec(f, HWAMEI_ORGAN);

    assert.ok(Number.isFinite(tenL) && tenL >= -1.15 && tenL <= 1.75, `tenL=${tenL} at ${f}Hz`);
    assert.ok(Number.isFinite(tenR) && tenR >= -1.15 && tenR <= 1.75, `tenR=${tenR} at ${f}Hz`);
    assert.ok(Number.isFinite(oecVolMl) && oecVolMl >= HWAMEI_ORGAN.minSongOecMl && oecVolMl <= HWAMEI_ORGAN.maxSongOecMl);
    assert.ok(Number.isFinite(beakGapeMm) && beakGapeMm > 0.4 && beakGapeMm < 24);

    assert.ok(tenL >= prevTenL, 'Left tension must rise with frequency');
    assert.ok(tenR >= prevTenR, 'Right tension must rise with frequency');
    assert.ok(oecVolMl <= prevOec + 1e-6, 'OEC cavity volume shrinks as sung frequency rises');

    prevTenL = tenL;
    prevTenR = tenR;
    prevOec = oecVolMl;
  }
});

test('PitchContourEvaluator produces silky continuous splines, all 6 ornaments, and biphonic duet harmony', () => {
  const keyframes = [
    { t: 0.0, ratio: 0.90, energy: 0.65 },
    { t: 0.25, ratio: 0.82, energy: 0.85 },
    { t: 0.60, ratio: 1.48, energy: 1.10 },
    { t: 1.0, ratio: 1.15, energy: 0.60 },
  ];

  const start = PitchContourEvaluator.sampleSpline(keyframes, 0);
  const end = PitchContourEvaluator.sampleSpline(keyframes, 1);
  assert.ok(Math.abs(start.ratio - 0.90) < 1e-5);
  assert.ok(Math.abs(end.ratio - 1.15) < 1e-5);

  // Verify C1 smoothness (no discontinuous jumps across 100 samples)
  let prevRatio = start.ratio;
  let peakRatio = 0;
  for (let i = 1; i <= 100; i++) {
    const pt = PitchContourEvaluator.sampleSpline(keyframes, i / 100);
    assert.ok(Number.isFinite(pt.ratio) && Number.isFinite(pt.energy));
    assert.ok(Math.abs(pt.ratio - prevRatio) < 0.05, `Spline jump too sharp: ${prevRatio} -> ${pt.ratio}`);
    peakRatio = Math.max(peakRatio, pt.ratio);
    prevRatio = pt.ratio;
  }
  assert.ok(peakRatio > 1.42, `Expected spline to pass smoothly through lyrical crest, got ${peakRatio}`);

  // Verify all 6 ornament kinds modulate pitch/amplitude cleanly without NaN
  const ornamentKinds: SyllableOrnamentKind[] = [
    'flute_vibrato',
    'liquid_warble',
    'sparkle_trill',
    'water_bubble',
    'mordent_turn',
    'grace_scoop',
  ];

  for (const kind of ornamentKinds) {
    const syl: AvianSyllable = {
      durationSec: 0.60,
      gapAfterSec: 0.05,
      rootHz: 2200,
      contour: [
        { t: 0, ratio: 1.0, energy: 1.0 },
        { t: 1, ratio: 1.0, energy: 1.0 },
      ],
      voice: 'auto',
      intensity: 0.95,
      timbreBright: 0.02,
      ornament: {
        kind,
        rateHz: 12.0,
        depthRatio: 0.08,
        delayFrac: 0.10,
        ampPulse: 0.25,
      },
      miniBreathAfter: false,
    };

    const freqs: number[] = [];
    for (let i = 1; i < 40; i++) {
      const pt = PitchContourEvaluator.evaluateSyllable(syl, (i / 40) * syl.durationSec, 0.3);
      assert.ok(Number.isFinite(pt.freqHz) && pt.freqHz > 580 && pt.freqHz < 6600);
      assert.ok(Number.isFinite(pt.energy01) && pt.energy01 >= 0);
      freqs.push(pt.freqHz);
    }
    const span = Math.max(...freqs) - Math.min(...freqs);
    assert.ok(span > 40, `Ornament ${kind} should meaningfully modulate pitch, got span=${span}Hz`);
  }

  // Verify simultaneous 2-voice duet entry timing
  const duetSyl: AvianSyllable = {
    durationSec: 0.50,
    gapAfterSec: 0.05,
    rootHz: 1850,
    contour: [
      { t: 0, ratio: 0.95, energy: 0.9 },
      { t: 0.5, ratio: 1.15, energy: 1.05 },
      { t: 1.0, ratio: 1.0, energy: 0.8 },
    ],
    voice: 'duet',
    harmonyRatio: 1.5,
    harmonyEntryFrac: 0.20,
    intensity: 0.95,
    timbreBright: 0.03,
    ornament: { kind: 'none', rateHz: 0, depthRatio: 0, delayFrac: 0, ampPulse: 0 },
    miniBreathAfter: false,
  };
  const beforeEntry = PitchContourEvaluator.evaluateSyllable(duetSyl, 0.05, 0);
  const afterEntry = PitchContourEvaluator.evaluateSyllable(duetSyl, 0.28, 0);
  assert.equal(beforeEntry.harmonyHz, null, 'Harmony should stay silent before harmonyEntryFrac');
  assert.ok(
    afterEntry.harmonyHz !== null && afterEntry.harmonyHz > afterEntry.freqHz * 1.4,
    `Expected upper 5th harmony voice after entry, got ${afterEntry.harmonyHz} vs ${afterEntry.freqHz}`
  );
});

test('MotifMutator creates immutable, musically distinct theme-and-variation transforms', () => {
  const source: AvianMotif = {
    archetype: 'lyrical_flute_scoop',
    category: 'lyrical',
    breathAfterSec: 0.18,
    syllables: [
      {
        durationSec: 0.48,
        gapAfterSec: 0.06,
        rootHz: 2100,
        contour: [
          { t: 0.0, ratio: 0.85, energy: 0.8 },
          { t: 0.5, ratio: 1.35, energy: 1.05 },
          { t: 1.0, ratio: 1.10, energy: 0.75 },
        ],
        voice: 'auto',
        intensity: 0.96,
        timbreBright: 0.02,
        ornament: { kind: 'none', rateHz: 0, depthRatio: 0, delayFrac: 0, ampPulse: 0 },
        miniBreathAfter: false,
      },
      {
        durationSec: 0.30,
        gapAfterSec: 0,
        rootHz: 2300,
        contour: [
          { t: 0.0, ratio: 1.15, energy: 0.9 },
          { t: 1.0, ratio: 0.90, energy: 0.7 },
        ],
        voice: 'auto',
        intensity: 0.92,
        timbreBright: 0.01,
        ornament: { kind: 'none', rateHz: 0, depthRatio: 0, delayFrac: 0, ampPulse: 0 },
        miniBreathAfter: false,
      },
    ],
  };

  const snapshotBefore = JSON.stringify(source);
  const rng = createSeededRng(101);

  const up = MotifMutator.mutate(source, 'transpose_up', CHINESE_HWAMEI_PROFILE, rng);
  assert.ok(up.syllables[0].rootHz > source.syllables[0].rootHz, 'transpose_up must raise pitch');

  const down = MotifMutator.mutate(source, 'transpose_down', CHINESE_HWAMEI_PROFILE, rng);
  assert.ok(down.syllables[0].rootHz < source.syllables[0].rootHz, 'transpose_down must lower pitch');

  const inv = MotifMutator.mutate(source, 'invert_contour', CHINESE_HWAMEI_PROFILE, rng);
  // Original rose from 0.85 to 1.35; inverted must drop from higher start to lower midpoint
  assert.ok(
    inv.syllables[0].contour[0].ratio > inv.syllables[0].contour[1].ratio,
    'invert_contour must mirror arch into valley'
  );

  const soft = MotifMutator.mutate(source, 'soft_answer', CHINESE_HWAMEI_PROFILE, rng);
  assert.ok(soft.syllables[0].intensity < source.syllables[0].intensity, 'soft_answer must soften intensity');
  assert.ok(soft.syllables[0].rootHz > source.syllables[0].rootHz, 'soft_answer must lift register');

  const duet = MotifMutator.mutate(source, 'biphonic_bloom', CHINESE_HWAMEI_PROFILE, rng);
  assert.equal(duet.syllables[0].voice, 'duet');
  assert.ok((duet.syllables[0].harmonyRatio ?? 0) >= 1.25);

  const embellished = MotifMutator.mutate(source, 'ornament_embellish', CHINESE_HWAMEI_PROFILE, rng);
  assert.notEqual(embellished.syllables[0].ornament.kind, 'none');

  const allKinds: MotifTransformKind[] = [
    'echo_humanized',
    'accelerando_spark',
    'rubato_stretch',
  ];
  for (const k of allKinds) {
    const out = MotifMutator.mutate(source, k, CHINESE_HWAMEI_PROFILE, rng);
    assert.equal(out.syllables.length, source.syllables.length);
  }

  // Original source must remain completely unmutated
  assert.equal(JSON.stringify(source), snapshotBefore);
});

test('AvianRepertoireGrammar composes richly diverse, non-repeating bouts sensitive to circadian mood', () => {
  const grammar = new AvianRepertoireGrammar();
  const rng = createSeededRng(2026);
  const dawnSched = evaluatePasserineCircadianSchedule(7.1, 'sunny');
  const rainSched = evaluatePasserineCircadianSchedule(11.0, 'rain');

  const uniqueArchetypes = new Set<string>();
  const signatures = new Set<string>();
  let totalMotifs = 0;

  for (let b = 0; b < 6; b++) {
    const bout = grammar.composeBout(CHINESE_HWAMEI_PROFILE, dawnSched, false, rng);
    assert.ok(bout.length >= 3, `Dawn bout should have >=3 motifs, got ${bout.length}`);
    signatures.add(bout.map((m) => m.archetype).join('>'));
    for (const m of bout) {
      uniqueArchetypes.add(m.archetype);
      totalMotifs += 1;
    }
  }

  assert.ok(
    uniqueArchetypes.size >= 8,
    `Expected rich repertoire variety (>=8 distinct archetypes across 6 bouts), got ${uniqueArchetypes.size}: ${Array.from(uniqueArchetypes).join(', ')}`
  );
  assert.ok(
    signatures.size >= 5,
    `Expected nearly every bout sequence to be unique, got ${signatures.size}/6 unique`
  );
  assert.ok(totalMotifs >= 20);

  // Rain mood should compose shorter, quieter bouts than dawn euphoria
  let rainMotifSum = 0;
  for (let b = 0; b < 4; b++) {
    rainMotifSum += grammar.composeBout(CHINESE_HWAMEI_PROFILE, rainSched, false, rng).length;
  }
  assert.ok(
    rainMotifSum / 4 < totalMotifs / 6,
    'Rainy pensive bouts should be more restrained than dawn chorus bouts'
  );
});

test('AvianSongDirector is reusable across multiple bird species with distinct tessituras and diversity', () => {
  const runSpecies = (profile: typeof CHINESE_HWAMEI_PROFILE, seed: number) => {
    const dir = new AvianSongDirector(profile, { seed, initialDelaySec: 0.25 });
    const motifs = new Set<string>();
    const freqs: number[] = [];
    let breathFrames = 0;
    for (let i = 0; i < 1200; i++) {
      const out = dir.update(0.05, 7.2, 'sunny'); // 60 seconds morning chorus
      assert.ok(Number.isFinite(out.syrinx.pSub) && Number.isFinite(out.syrinx.tensionL));
      if (out.anim.isBreathingIn) breathFrames += 1;
      if (out.anim.isSinging) {
        motifs.add(out.anim.currentMotif);
        if (out.syrinx.targetFreqHz > 0) freqs.push(out.syrinx.targetFreqHz);
      }
    }
    const meanHz = freqs.reduce((a, b) => a + b, 0) / Math.max(1, freqs.length);
    return { motifs, freqs, meanHz, breathFrames, stats: dir.getDebugStats() };
  };

  const hwamei = runSpecies(CHINESE_HWAMEI_PROFILE, 11);
  const thrush = runSpecies(MOUNTAIN_THRUSH_PROFILE, 22);
  const bulbul = runSpecies(LINGNAN_BULBUL_PROFILE, 33);

  assert.ok(
    hwamei.motifs.size >= 6,
    `Hwamei should sing >=6 distinct motif archetypes in 60s, got ${hwamei.motifs.size}: ${Array.from(hwamei.motifs).join(', ')}`
  );
  assert.ok(thrush.motifs.size >= 4, `Mountain thrush should sing varied motifs, got ${thrush.motifs.size}`);
  assert.ok(bulbul.motifs.size >= 4, `Lingnan bulbul should sing varied motifs, got ${bulbul.motifs.size}`);
  assert.ok(hwamei.breathFrames > 0, 'Hwamei should execute physiological inspiratory mini-breaths');
  assert.ok(
    bulbul.meanHz > hwamei.meanHz,
    `Smaller 32g Lingnan Bulbul (${bulbul.meanHz.toFixed(0)}Hz) should sing higher than 56g Hwamei (${hwamei.meanHz.toFixed(0)}Hz)`
  );
});

test('Circadian & weather schedule peaks in early morning, sleeps at night, and quiets in rain', () => {
  const morningSunny = evaluateHwameiCircadianActivity(7.2, 'sunny');
  const middaySunny = evaluateHwameiCircadianActivity(13.0, 'sunny');
  const duskSunny = evaluateHwameiCircadianActivity(18.5, 'sunny');
  const midnightSunny = evaluateHwameiCircadianActivity(1.5, 'sunny');
  const morningRain = evaluateHwameiCircadianActivity(7.2, 'rain');

  assert.equal(morningSunny.isSleeping, false);
  assert.ok(morningSunny.activity > 0.85, `Expected strong morning chorus, got ${morningSunny.activity}`);
  assert.ok(morningSunny.activity > middaySunny.activity, 'Morning chorus should exceed midday activity');
  assert.ok(middaySunny.activity > duskSunny.activity, 'Midday should exceed late dusk');
  assert.equal(midnightSunny.isSleeping, true);
  assert.equal(midnightSunny.activity, 0);
  assert.ok(
    morningRain.activity < morningSunny.activity * 0.4,
    'Rain should significantly quiet Hwamei singing'
  );
  assert.ok(
    morningSunny.pauseMaxSec < middaySunny.pauseMaxSec,
    'Morning chorus should have shorter rests between bouts than midday'
  );
});

test('HwameiSongController improvises varied phrases, pauses naturally, sleeps at night, and wakes on excite()', () => {
  const ctrl = new HwameiSongController({ seed: 42, initialDelaySec: 0.4 });
  const motifsSeen = new Set<string>();
  const freqSamples: number[] = [];
  let singingFrames = 0;
  let restingFrames = 0;
  let maxBeak = 0;
  let maxThroat = 0;

  // Simulate 35 seconds of sunny morning at 20 Hz
  for (let i = 0; i < 700; i++) {
    const out = ctrl.update(0.05, 7.2, 'sunny');
    assert.ok(Number.isFinite(out.syrinx.pSub));
    assert.ok(Number.isFinite(out.syrinx.tensionL));
    assert.ok(Number.isFinite(out.syrinx.tensionR));
    assert.ok(Number.isFinite(out.syrinx.oecVolMl));
    assert.ok(out.anim.beakOpen01 >= 0 && out.anim.beakOpen01 <= 1);
    assert.ok(out.anim.throatPulse01 >= 0 && out.anim.throatPulse01 <= 1);

    if (out.anim.isSinging) {
      singingFrames += 1;
      motifsSeen.add(out.anim.currentMotif);
      if (out.syrinx.targetFreqHz > 0) freqSamples.push(out.syrinx.targetFreqHz);
      maxBeak = Math.max(maxBeak, out.anim.beakOpen01);
      maxThroat = Math.max(maxThroat, out.anim.throatPulse01);
    } else {
      restingFrames += 1;
    }
  }

  assert.ok(singingFrames > 60, `Expected active morning singing, got ${singingFrames} frames`);
  assert.ok(restingFrames > 40, `Expected natural resting pauses, got ${restingFrames} frames`);
  assert.ok(motifsSeen.size >= 5, `Expected richly varied improvised motifs (>=5), got ${Array.from(motifsSeen).join(', ')}`);
  assert.ok(maxBeak > 0.35, `Expected expressive beak opening while singing, got ${maxBeak}`);
  assert.ok(maxThroat > 0.35, `Expected throat pulse while singing, got ${maxThroat}`);

  // Confirm live pitch melody actually varies across a musical range
  const minF = Math.min(...freqSamples);
  const maxF = Math.max(...freqSamples);
  assert.ok(maxF - minF > 900, `Expected melodious pitch sweep (>900Hz span), got ${minF}..${maxF}`);

  // Night sleeping check + excite() wake check
  const nightCtrl = new HwameiSongController({ seed: 7, initialDelaySec: 0.2 });
  for (let i = 0; i < 40; i++) {
    const out = nightCtrl.update(0.05, 23.0, 'sunny');
    assert.equal(out.anim.isSleeping, true);
    assert.equal(out.anim.isSinging, false);
  }
  nightCtrl.excite(5.0);
  const awakeOut = nightCtrl.update(0.1, 23.0, 'sunny');
  assert.equal(awakeOut.anim.isSleeping, false);
  assert.ok(awakeOut.anim.excitedLevel > 0.5);
});

test('Spatial acoustic propagation obeys inverse-distance rolloff, air absorption, wall occlusion, and stereo pan', () => {
  const cage = { x: 4.92, y: 1.98, z: 14.65 };
  const fwdNorth = { x: 0, y: 0, z: -1 };
  const rightEast = { x: 1, y: 0, z: 0 };

  // Standing directly beside the cage in Front Skywell (1.6m away, clear line of sight)
  const near = computeHwameiSpatialAcoustics(
    cage,
    { x: 3.32, y: 1.65, z: 14.65 },
    fwdNorth,
    rightEast
  );
  // Across the open Front Skywell (~7.5m away, clear line of sight)
  const midSkywell = computeHwameiSpatialAcoustics(
    cage,
    { x: -2.2, y: 1.65, z: 12.8 },
    fwdNorth,
    rightEast
  );
  // Outside on He-Ping forecourt (z = 26, behind front facade wall!)
  const outsideHePing = computeHwameiSpatialAcoustics(
    cage,
    { x: 4.92, y: 1.65, z: 26.0 },
    fwdNorth,
    rightEast,
    { doumenOpen: false }
  );
  // Far away by the rear mountain forest (~65m away, behind multiple walls)
  const farForest = computeHwameiSpatialAcoustics(
    cage,
    { x: 4.0, y: 2.0, z: -48.0 },
    fwdNorth,
    rightEast
  );

  assert.equal(near.wallCrossings, 0);
  assert.ok(near.directGain > 0.60, `Expected loud near gain, got ${near.directGain}`);
  assert.ok(near.directGain > midSkywell.directGain, 'Gain must drop across skywell');
  assert.ok(midSkywell.directGain > outsideHePing.directGain, 'Gain must drop outside masonry walls');
  assert.ok(outsideHePing.wallCrossings >= 1, 'Front wall must occlude He-Ping forecourt');
  assert.ok(outsideHePing.lowpassHz < midSkywell.lowpassHz, 'Wall occlusion + distance must muffle highs');
  assert.ok(farForest.directGain < 0.05, `Expected very faint far-forest gain, got ${farForest.directGain}`);

  // Stereo pan direction test: cage to the East (+X) vs West (-X) when facing North (-Z)
  assert.ok(near.pan > 0.4, `Cage to the right should pan positive, got ${near.pan}`);
  const toLeft = computeHwameiSpatialAcoustics(
    cage,
    { x: 7.5, y: 1.65, z: 14.65 },
    fwdNorth,
    rightEast
  );
  assert.ok(toLeft.pan < -0.4, `Cage to the left should pan negative, got ${toLeft.pan}`);

  // Zero-distance safety (no NaN)
  const zeroDist = computeHwameiSpatialAcoustics(cage, cage, fwdNorth, rightEast);
  assert.ok(Number.isFinite(zeroDist.directGain) && Number.isFinite(zeroDist.pan) && zeroDist.pan === 0);

  // Wall crossing helper sanity check
  assert.equal(countAcousticWallCrossings(4.92, 14.65, 3.0, 14.0, false), 0);
  assert.ok(countAcousticWallCrossings(4.92, 14.65, 4.92, 26.0, false) >= 1);
});
