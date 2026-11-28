import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGableSlopeY,
  computeLanternCenterY,
  computeLanternTopY,
  computeInnerWeilongLanternAnchor,
  isUnderRoof,
  computeRunoffCalibration,
  computeLightningEnvelope,
  computeThunderDelaySec,
} from './weatherPhysics';

describe('weatherPhysics — lantern & eave anchor calibration', () => {
  it('connects lantern cord top exactly to the target anchor Y', () => {
    const anchorY = 3.14;
    const scale = 0.96;
    const cordLen = 0.30;
    const centerY = computeLanternCenterY(anchorY, scale, cordLen);
    const topY = computeLanternTopY(centerY, scale, cordLen);
    assert.ok(Math.abs(topY - anchorY) < 1e-6, `Expected topY ${topY} to equal anchorY ${anchorY}`);
  });

  it('keeps concave roof slope strictly between eave and ridge with realistic sag', () => {
    const eaveY = 3.15;
    const ridgeY = 5.45;
    const y0 = computeGableSlopeY(eaveY, ridgeY, 0, 0.22);
    const yMid = computeGableSlopeY(eaveY, ridgeY, 0.5, 0.22);
    const y1 = computeGableSlopeY(eaveY, ridgeY, 1.0, 0.22);
    assert.ok(y0 > eaveY && y0 < eaveY + 0.05);
    assert.ok(yMid < (eaveY + ridgeY) * 0.5, 'Mid-slope should have concave catenary sag');
    assert.ok(Math.abs(y1 - ridgeY) < 1e-6);
  });

  it('places Inner Weilong lantern anchors directly under the real curved inner eave purlin', () => {
    const northAnchor = computeInnerWeilongLanternAnchor(0.5);
    // At t = 0.5 (north center), inner eave is near z ≈ -19.63 and purlin slightly further north around -20.08
    assert.ok(Math.abs(northAnchor.x) < 0.05, `Expected north x near 0, got ${northAnchor.x}`);
    assert.ok(northAnchor.z < -19.5 && northAnchor.z > -20.6, `Unexpected north anchor z: ${northAnchor.z}`);
    assert.ok(northAnchor.y > 4.6 && northAnchor.y < 5.3, `Unexpected north anchor y: ${northAnchor.y}`);
    assert.equal(isUnderRoof(northAnchor.x, northAnchor.z), true, 'Inner Weilong lantern must sit beneath roof');
  });
});

describe('weatherPhysics — roof occlusion footprint', () => {
  it('identifies covered halls and wings as under roof', () => {
    assert.equal(isUnderRoof(0, 19.15), true, 'Front Wing Lower Hall should be under roof');
    assert.equal(isUnderRoof(0, 7.95), true, 'Middle Hall should be under roof');
    assert.equal(isUnderRoof(0, -2.7), true, 'Upper Hall should be under roof');
    assert.equal(isUnderRoof(4.95, 14.6), true, 'Birdcage veranda eave should be under roof');
    assert.equal(isUnderRoof(13.3, 6.4), true, 'Inner East Wing should be under roof');
    assert.equal(isUnderRoof(0, -22.8), true, 'Inner Weilong Ring north bay should be under roof');
  });

  it('identifies open skywells, Hua-Tai, and He-Ping courtyard as open sky', () => {
    assert.equal(isUnderRoof(0, 13.6), false, 'Front Skywell center must be open to rain');
    assert.equal(isUnderRoof(0, 2.8), false, 'Rear Skywell center must be open to rain');
    assert.equal(isUnderRoof(0, -12.5), false, 'Hua-Tai center must be open to rain');
    assert.equal(isUnderRoof(0, 28.0), false, 'He-Ping forecourt must be open to rain');
    assert.equal(isUnderRoof(0, 42.0), false, 'Half-Moon Pond must be open to rain');
  });
});

describe('weatherPhysics — runoff calibration & thunderstorm timing', () => {
  it('keeps runoff zero in sunny weather and restrained/monotonic in rain', () => {
    const dry = computeRunoffCalibration(0);
    const light = computeRunoffCalibration(0.4);
    const full = computeRunoffCalibration(1.0);
    assert.equal(dry.roofStreamStrength, 0);
    assert.equal(dry.eaveCurtainAlpha, 0);
    assert.ok(light.roofStreamStrength > 0 && light.roofStreamStrength < full.roofStreamStrength);
    assert.ok(full.roofStreamStrength <= 0.16, 'Roof rivulets must remain restrained');
    assert.ok(full.eaveCurtainAlpha <= 0.38, 'Eave drips must remain delicate, not heavy waterfalls');
  });

  it('produces a bounded double-pulse lightning envelope and physical thunder delay', () => {
    assert.equal(computeLightningEnvelope(-0.1), 0);
    assert.ok(computeLightningEnvelope(0.045) > 0.85, 'Primary lightning flash should peak brightly');
    assert.ok(computeLightningEnvelope(0.165) > 0.5, 'Secondary intra-cloud flicker should pulse');
    assert.equal(computeLightningEnvelope(0.5), 0);

    const nearDelay = computeThunderDelaySec(450);
    const farDelay = computeThunderDelaySec(1100);
    assert.ok(nearDelay > 1.2 && nearDelay < 1.5);
    assert.ok(farDelay > 3.0 && farDelay < 3.4);
    assert.ok(farDelay > nearDelay);
  });
});

describe('weatherPhysics — roof clearance & curved Weilong exterior winding', () => {
  it('keeps Hengwu, Front, Middle, Upper Hall, and Rear Skywell walls strictly below concave roof sheathing', () => {
    const sheathOffset = 0.048;
    // Hengwu outer wall (x = ±18.4, cap outer edge ±18.64) under Hengwu roof (cx = ±15.2, halfS = 3.76)
    const hengwuOuterF = (18.96 - 18.64) / 3.76;
    const hengwuSheathY = computeGableSlopeY(3.25, 5.45, hengwuOuterF, 0.21) - sheathOffset;
    assert.ok(0.32 + 2.96 < hengwuSheathY, `Hengwu outer wall must sit below sheathing (${hengwuSheathY.toFixed(3)})`);

    // Front Hall inner corridor wall (z = 16.55, cap north edge 16.32) under Front roof (cz = 19.15, halfS = 3.305)
    const frontInnerF = (16.32 - (19.15 - 3.305)) / 3.305;
    const frontSheathY = computeGableSlopeY(3.15, 5.35, frontInnerF, 0.22) - sheathOffset;
    assert.ok(0.25 + 3.02 < frontSheathY, `Front inner wall must sit below sheathing (${frontSheathY.toFixed(3)})`);

    // Upper Hall rear shrine wall (z = -5.6, cap north edge -5.87) under Upper roof (cz = -2.7, halfS = 3.78)
    const upperRearF = (6.48 - 5.87) / 3.78;
    const upperRearSheathY = computeGableSlopeY(4.65, 7.85, upperRearF, 0.22) - sheathOffset;
    assert.ok(0.85 + 4.08 < upperRearSheathY, `Upper rear wall must sit below sheathing (${upperRearSheathY.toFixed(3)})`);

    // Upper Hall side partition wall south tip (z = +0.8) under Upper roof (south eave +1.08)
    const upperSideF = (1.08 - 0.8) / 3.78;
    const upperSideSheathY = computeGableSlopeY(4.65, 7.85, upperSideF, 0.22) - sheathOffset;
    assert.ok(0.85 + 3.85 < upperSideSheathY, `Upper side wall must sit below sheathing (${upperSideSheathY.toFixed(3)})`);

    // Rear Skywell colonnade beam (x = ±4.7, top y = 3.61 + 0.11 = 3.72) under Rear Skywell pyramid roof (eave x = ±4.5)
    const rearColF = (4.7 - 4.5) / 3.1;
    const rearSheathY = 3.65 + (6.55 - 3.65) * rearColF - 0.18 * Math.sin(rearColF * Math.PI) - sheathOffset;
    assert.ok(3.61 + 0.11 < rearSheathY, `Rear skywell beam must sit below sheathing (${rearSheathY.toFixed(3)})`);
  });
});

