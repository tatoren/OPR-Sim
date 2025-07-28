// SECTION: Core Probability Functions

/**
 * Calculates the probability of a single die roll succeeding.
 * @param {number} target - The number to roll or higher.
 * @returns {number} The probability (0 to 1).
 */
function getSuccessChance(target) {
    if (target > 6) return 1 / 6; // Natural 6 always succeeds
    if (target < 2) target = 2;   // Natural 1 always fails
    return (6 - target + 1) / 6;
}

// SECTION: Unit Analysis

/**
 * Generates a probability analysis for a single unit.
 * @param {object} unit - The unit object from parseUnitBlock.
 * @returns {object} A structured analysis object.
 */
function generateUnitAnalysis(unit) {
    const analysis = {
        weaponProfiles: [],
        defenseProfile: {},
        mobility: {},
    };

    // 1. Analyze Weapon Profiles
    unit.weapons.forEach(weapon => {
        const hitChance = getSuccessChance(unit.quality);

        // Calculate chance for a defender to fail a save vs this weapon
        const saveTargetForD4 = 4 + weapon.AP;
        const saveChanceOnD4 = getSuccessChance(saveTargetForD4);
        const failedSaveChance = 1 - saveChanceOnD4;

        // Calculate the total probability of one attack hitting AND wounding
        const totalWoundChance = hitChance * failedSaveChance;

        analysis.weaponProfiles.push({
            Weapon: weapon.name,
            "Attacks per Model": weapon.Attacks,
            "AP": weapon.AP,
            "Hit Chance (%)": (hitChance * 100).toFixed(2),
            "Fail Save vs D4+ (%)": (failedSaveChance * 100).toFixed(2),
            "Total Wound Chance (%)": (totalWoundChance * 100).toFixed(2),
        });
    });

    // 2. Analyze Defensive Profile
    const saveChanceVsAP1 = getSuccessChance(unit.defense + 1) * 100;
    analysis.defenseProfile = { saveChanceVsAP1 };

    // 3. Analyze Mobility
    const rushMove = unit.specialRules.includes('Fast') ? 16 : unit.specialRules.includes('Slow') ? 8 : 12;
    analysis.mobility = { maxRushDistance: rushMove * 4 };

    return analysis;
}


// SECTION: Simulation Functions

function simulateHitRolls(numDice, quality, modifier = 0) {
    let successes = 0;
    let sixes = 0;
    const target = quality - modifier;

    for (let i = 0; i < numDice; i++) {
        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll === 1) continue; // Natural 1 always fails
        if (roll === 6) { // Natural 6 always succeeds
            successes++;
            sixes++;
            continue;
        }
        if (roll >= target) {
            successes++;
        }
    }
    return { successes, sixes };
}

function simulateDefenseRolls(numDice, defense, ap = 0) {
    let successes = 0;
    const target = defense + ap;

    for (let i = 0; i < numDice; i++) {
        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll === 1) continue;
        if (roll === 6) {
            successes++;
            continue;
        }
        if (roll >= target) {
            successes++;
        }
    }
    return successes;
}

function calculateHits({ weaponProfile, attackerStats, numModels }) {
    const { Attacks, AP = 0, Furious = false, Predator = false } = weaponProfile;
    const { quality, Modifier = 0 } = attackerStats;
    
    let totalDice = numModels * Attacks;
    let hitResults = simulateHitRolls(totalDice, quality, Modifier);
    let totalHits = hitResults.successes;

    if (Furious) {
        totalHits += hitResults.sixes;
    }

    if (Predator && hitResults.sixes > 0) {
        const bonusRolls = simulateHitRolls(hitResults.sixes, quality, Modifier);
        totalHits += bonusRolls.successes;
    }
    
    return {
        hits: totalHits,
        ap: AP,
    };
}

function rangedAttack({
  weaponProfile,
  attackerStats,
  numModels,
  targetStats,
  distanceToTarget,
}) {
  
  const weaponRange = weaponProfile.Range;

  if (distanceToTarget > weaponRange) {
    return {
      inRange: false,
      totalWounds: 0,
      note: 'Target out of range',
    };
  }

  const { hits, ap } = calculateHits({ weaponProfile, attackerStats, numModels });
  const successfulSaves = simulateDefenseRolls(hits, targetStats.defense, ap);
  let totalWounds = hits - successfulSaves;

  if (weaponProfile.Deadly) {
      totalWounds *= weaponProfile.Deadly;
  }

  return {
    inRange: true,
    totalWounds,
  };
}

function meleeResolution({ attacker, defender }) {
    const attackerWeapon = attacker.weapons.find(w => w.Range === 0) || { Attacks: 1, AP: 0 };
    const defenderWeapon = defender.weapons.find(w => w.Range === 0) || { Attacks: 1, AP: 0 };

    const attackerEffectiveStats = { ...attacker, quality: attacker.hasFoughtInMeleeThisTurn ? 6 : attacker.quality };
    const defenderEffectiveStats = { ...defender, quality: defender.hasFoughtInMeleeThisTurn ? 6 : defender.quality };

    const attackerHits = calculateHits({ weaponProfile: attackerWeapon, attackerStats: attackerEffectiveStats, numModels: attacker.numModels });
    const defenderHits = calculateHits({ weaponProfile: defenderWeapon, attackerStats: defenderEffectiveStats, numModels: defender.numModels });

    const attackerSaves = simulateDefenseRolls(defenderHits.hits, attacker.defense, defenderHits.ap);
    const defenderSaves = simulateDefenseRolls(attackerHits.hits, defender.defense, attackerHits.ap);

    let woundsToAttacker = defenderHits.hits - attackerSaves;
    let woundsToDefender = attackerHits.hits - defenderSaves;

    if (defenderWeapon.Deadly) woundsToAttacker *= defenderWeapon.Deadly;
    if (attackerWeapon.Deadly) woundsToDefender *= attackerWeapon.Deadly;

    return {
        totalWoundsToDefender: woundsToDefender,
        totalWoundsToAttacker: woundsToAttacker,
    };
}

function resolvePostCombatMorale(unit, originalNumModels) {
  let passedMorale = (Math.floor(Math.random() * 6) + 1) >= unit.quality;

  if (!passedMorale && unit.specialRules?.includes('Fearless')) {
      passedMorale = (Math.floor(Math.random() * 6) + 1) >= 4;
  }

  if (passedMorale) {
    return 'PASS';
  } else {
    if (unit.numModels < originalNumModels / 2) {
      return 'RETREAT';
    } else {
      return 'SHAKEN';
    }
  }
}

// This function uses probability, and is ONLY for the AI to make decisions.
function estimateMeleeEffectiveness(unit, opponent) {
    const unitWeapon = unit.weapons.find(w => w.Range === 0) || { Attacks: 1, AP: 0 };
    const opponentWeapon = opponent.weapons.find(w => w.Range === 0) || { Attacks: 1, AP: 0 };

    // Effective quality considering fatigue
    const unitQuality = unit.hasFoughtInMeleeThisTurn ? 6 : unit.quality;
    const opponentQuality = opponent.hasFoughtInMeleeThisTurn ? 6 : opponent.quality;

    const unitHitChance = getSuccessChance(unitQuality);
    const opponentHitChance = getSuccessChance(opponentQuality);

    const unitHits = unit.numModels * unitWeapon.Attacks * unitHitChance;
    const opponentHits = opponent.numModels * opponentWeapon.Attacks * opponentHitChance;

    const unitWoundChance = 1 - getSuccessChance(opponent.defense + unitWeapon.AP);
    const opponentWoundChance = 1 - getSuccessChance(unit.defense + opponentWeapon.AP);

    const expectedWoundsOnOpponent = unitHits * unitWoundChance;
    const expectedWoundsOnUnit = opponentHits * opponentWoundChance;

    return { expectedWoundsOnOpponent, expectedWoundsOnUnit };
}

function decideAction({ attacker, opponent, distanceToTarget }) {
    if (attacker.shaken) {
        return 'idle';
    }

    if (distanceToTarget === 0) {
        const { expectedWoundsOnOpponent, expectedWoundsOnUnit } = estimateMeleeEffectiveness(attacker, opponent);
        if (expectedWoundsOnUnit > expectedWoundsOnOpponent) {
            return 'advance'; // Choosing to advance away from melee
        }
        return 'fight';
    }

    const chargeRange = attacker.chargeRange || 12;
    const advanceRange = attacker.advanceRange || 6;
    const rangedWeapon = attacker.weapons.find((w) => w.Range > 0);

    const canCharge = distanceToTarget <= chargeRange;
    const canShootHold = rangedWeapon && distanceToTarget <= rangedWeapon.Range;
    const canShootAdvance = rangedWeapon && distanceToTarget <= rangedWeapon.Range + advanceRange;

    if (canCharge) {
        return 'charge';
    }
    if (canShootHold) {
        return 'hold';
    }
    if (canShootAdvance) {
        return 'advance';
    }
    return 'rush';
}

function simulateRangedExchangeUntilMelee({
  unitA,
  unitB,
  startingDistance = 24,
  attackerFirst = true,
}) {
  const cloneUnit = (unit) => ({
    ...unit,
    numModels: unit.numModels,
    originalNumModels: unit.numModels,
    shaken: false,
    hasFoughtInMeleeThisTurn: false,
    weapons: unit.weapons.map((w) => ({ ...w })),
  });

  const attacker = cloneUnit(unitA);
  const defender = cloneUnit(unitB);

  const attackerIsFast = attacker.specialRules?.includes('Fast');
  const attackerIsSlow = attacker.specialRules?.includes('Slow');
  const defenderIsFast = defender.specialRules?.includes('Fast');
  const defenderIsSlow = defender.specialRules?.includes('Slow');

  attacker.advanceRange = attackerIsFast ? 8 : attackerIsSlow ? 4 : 6;
  attacker.chargeRange = attackerIsFast ? 16 : attackerIsSlow ? 8 : 12;
  defender.advanceRange = defenderIsFast ? 8 : defenderIsSlow ? 4 : 6;
  defender.chargeRange = defenderIsFast ? 16 : defenderIsSlow ? 8 : 12;

  let currentDistance = startingDistance;
  let turn = 0;
  const log = [];

  const handleMeleeRound = (unit1, unit2) => {
    const meleeResult = meleeResolution({ attacker: unit1, defender: unit2 });
    
    unit1.hasFoughtInMeleeThisTurn = true;
    unit2.hasFoughtInMeleeThisTurn = true;

    const killsOnUnit2 = Math.floor((meleeResult.totalWoundsToDefender || 0) / (unit2.toughValue || 1));
    const killsOnUnit1 = Math.floor((meleeResult.totalWoundsToAttacker || 0) / (unit1.toughValue || 1));

    unit2.numModels = Math.max(0, unit2.numModels - killsOnUnit2);
    unit1.numModels = Math.max(0, unit1.numModels - killsOnUnit1);

    log.push(`> Melee Result: ${unit1.name} inflicts ${killsOnUnit2} kills. ${unit2.name} inflicts ${killsOnUnit1} kills.`);

    let loser = null;
    if (meleeResult.totalWoundsToDefender > meleeResult.totalWoundsToAttacker) {
        loser = unit2;
    } else if (meleeResult.totalWoundsToAttacker > meleeResult.totalWoundsToDefender) {
        loser = unit1;
    }

    if (loser && loser.numModels > 0) {
        log.push(`> ${loser.name} lost the combat and must test morale.`);
        const moraleResult = resolvePostCombatMorale(loser, loser.originalNumModels);
        
        switch (moraleResult) {
            case 'PASS':
                log.push(`>> ${loser.name} passed morale.`);
                break;
            case 'SHAKEN':
                loser.shaken = true;
                log.push(`>> ${loser.name} is Shaken!`);
                break;
            case 'RETREAT':
                log.push(`>> ${loser.name} failed morale and retreats! The unit is destroyed.`);
                loser.numModels = 0;
                break;
        }
    } else if (!loser) {
        log.push(`> Melee is a draw. No morale test needed.`);
    }
  };

  for (turn = 1; turn <= 4; turn++) {
    if (attacker.numModels <= 0 || defender.numModels <= 0) break;

    log.push(`\n--- Turn ${turn} ---`);
    attacker.hasFoughtInMeleeThisTurn = false;
    defender.hasFoughtInMeleeThisTurn = false;
    
    const unitActs = (unit, opponent) => {
      const initialDistance = currentDistance;
      const decision = decideAction({
        attacker: unit,
        opponent: opponent,
        distanceToTarget: currentDistance,
      });

      if (decision === 'idle') {
          log.push(`${unit.name} is Shaken and idles to recover.`);
          unit.shaken = false;
      } else if (decision === 'charge') {
        currentDistance = 0;
        log.push(`${unit.name} charges into ${opponent.name}.`);
        handleMeleeRound(unit, opponent);
        return true; // Charge occurred
      } else if (decision === 'fight') {
        log.push(`${unit.name} fights ${opponent.name} in melee.`);
        handleMeleeRound(unit, opponent);
      } else if (decision === 'hold' || decision === 'advance') {
          let actionText = "holds and shoots";
          if (decision === 'advance') {
              if(initialDistance === 0) {
                  currentDistance += unit.advanceRange;
                  actionText = `retreats ${unit.advanceRange}" and shoots`;
              } else {
                  currentDistance = Math.max(0, currentDistance - unit.advanceRange);
                  actionText = `advances ${unit.advanceRange}" and shoots`;
              }
          }
          log.push(`${unit.name} ${actionText}.`);
          const rangedWeapon = unit.weapons.find(w => w.Range > 0 && w.Range >= currentDistance);
          if (rangedWeapon) {
            const result = rangedAttack({
              weaponProfile: rangedWeapon,
              attackerStats: unit,
              numModels: unit.numModels,
              targetStats: opponent,
              distanceToTarget: currentDistance,
            });
            const kills = Math.min(opponent.numModels, Math.floor((result.totalWounds ?? 0) / (opponent.toughValue || 1)));
            opponent.numModels -= kills;
            log.push(`> ${rangedWeapon.name} kills ${kills} models.`);
          }
      } else if (decision === 'rush') {
        const rushDist = unit.chargeRange;
        currentDistance = Math.max(0, currentDistance - rushDist);
        log.push(`${unit.name} rushes ${rushDist}" forward.`);
      }
      return false; // No charge occurred
    };

    let chargeOccurred = false;
    if (attackerFirst) {
      if (attacker.numModels > 0) chargeOccurred = unitActs(attacker, defender);
      if (defender.numModels > 0 && !chargeOccurred) unitActs(defender, attacker);
    } else {
      if (defender.numModels > 0) chargeOccurred = unitActs(defender, attacker);
      if (attacker.numModels > 0 && !chargeOccurred) unitActs(attacker, defender);
    }
  }

  return {
    turnsElapsed: turn - 1,
    finalDistance: currentDistance,
    survivingA: attacker.numModels,
    survivingB: defender.numModels,
    log,
  };
}

// SECTION: Utility Functions

function parseUnitBlock(inputText) {
  const lines = inputText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const units = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('++')) continue;

    if (line.includes('Q') && line.includes('D')) {
        const statLine = line;
        const weaponLine = lines[i + 1] || "";

        const [nameAndCount, pointsText, ...rulesText] = statLine
            .split('|')
            .map((s) => s.trim());

        if (!nameAndCount || !pointsText) continue;

        const nameMatch = nameAndCount.match(/^(.+?)\s*\[(\d+)\]/);
        if (!nameMatch) continue;

        const namePart = nameMatch[1].trim();
        const modelCount = parseInt(nameMatch[2]);

        const matchStats = nameAndCount.match(/Q(\d)\+.*D(\d)\+/);
        if (!matchStats) continue;

        const quality = parseInt(matchStats[1]);
        const defense = parseInt(matchStats[2]);
        const points = parseInt(pointsText);
        const specialRules = rulesText
            .join(',')
            .split(',')
            .map((r) => r.trim())
            .filter((r) => r && !r.includes('('));

        let cleanedWeaponLine = weaponLine
            .replace(/\r/g, '')
            .replace(/\n/g, '')
            .replace(/"/g, '')
            .trim();

        const weapons = cleanedWeaponLine
            .split(/,(?=\s*\d+x\s)/)
            .map((w) => {
                w = w.trim();
                const match = w.match(/^(\d+)x\s+([^(]+)\s*\((.+)\)$/);
                if (!match) return null;

                const count = parseInt(match[1]);
                const name = match[2].trim();
                const profile = (match[3] || '').split(',').map((p) => p.trim());

                const parsed = {
                    name,
                    count,
                    Range: 0,
                    Attacks: 0,
                    AP: 0,
                };

                profile.forEach((p) => {
                    p = p.trim();
                    if (p.endsWith('"') || /^\d+$/.test(p)) {
                        parsed.Range = parseInt(p.replace('"', ''));
                    } else if (/^A\d+/i.test(p)) {
                        parsed.Attacks = parseInt(p.slice(1));
                    } else if (p.startsWith('AP(')) {
                        const apMatch = p.match(/AP\((\d+)\)/);
                        if (apMatch) parsed.AP = parseInt(apMatch[1]);
                    }
                });

                return parsed;
            })
            .filter(Boolean);

        units.push({
            name: namePart,
            numModels: modelCount,
            quality,
            defense,
            points,
            specialRules,
            weapons,
        });
        i++;
    }
  }
  return units;
}

module.exports = {
  // Analysis
  generateUnitAnalysis,
  // Simulation
  simulateRangedExchangeUntilMelee,
  // Shared Utilities
  parseUnitBlock,
};
