const fs = require("fs");
const {
  parseUnitBlock,
  simulateRangedExchangeUntilMelee,
  generateUnitAnalysis,
} = require("./probabilityCalculator.js");


// Load units from "units.txt"
const inputText = fs.readFileSync("./units.txt", "utf-8");
const units = parseUnitBlock(inputText);

// --- Unit Analysis Section ---
console.log("===============================");
console.log("= UNIT PROBABILITY ANALYSIS =");
console.log("===============================");
units.forEach(unit => {
    const analysis = generateUnitAnalysis(unit);
    console.log(`\n--- Analysis for: ${unit.name} [${unit.numModels}] ---`);
    console.table(analysis.weaponProfiles);
    console.log(`Defensive Profile:`);
    console.log(`  > Chance to Save vs AP(1): ${analysis.defenseProfile.saveChanceVsAP1.toFixed(2)}%`);
    console.log(`Mobility Profile:`);
    console.log(`  > Max movement in 4 turns (Rushing): ${analysis.mobility.maxRushDistance}"`);
});


// --- Combat Simulation Section ---
if (units.length >= 2) {
    console.log("\n\n============================");
    console.log("= COMBAT SIMULATION      =");
    console.log("============================");
    const [unitA, unitB] = units;
    const result = simulateRangedExchangeUntilMelee({
      unitA,
      unitB,
      startingDistance: 24,
      attackerFirst: true,
    });
    
    console.log(`\nFinal Tally:`);
    console.log(`  > Turns Elapsed: ${result.turnsElapsed}`);
    console.log(`  > Final Distance: ${result.finalDistance}"`);
    console.log(`  > Surviving ${unitA.name}: ${result.survivingA}`);
    console.log(`  > Surviving ${unitB.name}: ${result.survivingB}`);
    console.log("\nCombat Log:");
    console.log(result.log.join("\n"));
} else {
    console.error("\nError: Not enough units for combat simulation (requires at least 2).");
}
