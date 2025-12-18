
import { ColorType, RuleType, Rule, ObstacleItem, ObstacleRow, ObstacleType, PowerUpType } from '../types';
import { ALL_COLORS } from '../constants';

// Helper to pick random item from array
const randomPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Generate a random rule, optionally excluding a specific one to ensure variety
export const generateRule = (exclude?: Rule, forcedType?: RuleType): Rule => {
  let newRule: Rule;
  
  do {
    const type = forcedType ?? (Math.random() > 0.5 ? RuleType.MATCH_COLOR : RuleType.MATCH_WORD);
    const targetColor = randomPick(ALL_COLORS);
    newRule = { type, targetColor };
  } while (
    exclude && 
    newRule.type === exclude.type && 
    newRule.targetColor === exclude.targetColor
  );

  return newRule;
};

// Generate a single Stroop item (circle with text)
const generateItem = (
  mustBeCorrect: boolean,
  rule: Rule,
  forceIncorrect: boolean = false
): ObstacleItem => {
  let displayColor: ColorType;
  let wordText: ColorType;

  if (mustBeCorrect) {
    if (rule.type === RuleType.MATCH_COLOR) {
      // Must match color. Text should ideally NOT match color to cause Stroop effect.
      displayColor = rule.targetColor;
      // 70% chance to have mismatching text for difficulty
      const mismatch = Math.random() < 0.7;
      wordText = mismatch 
        ? randomPick(ALL_COLORS.filter(c => c !== displayColor))
        : displayColor;
    } else {
      // RuleType.MATCH_WORD
      // Must match text. Color should ideally NOT match text.
      wordText = rule.targetColor;
      const mismatch = Math.random() < 0.7;
      displayColor = mismatch
        ? randomPick(ALL_COLORS.filter(c => c !== wordText))
        : wordText;
    }
  } else {
    // Must be incorrect (Distractor)
    // We must ensure it does NOT satisfy the rule.
    
    if (rule.type === RuleType.MATCH_COLOR) {
      // Color cannot be the target.
      displayColor = randomPick(ALL_COLORS.filter(c => c !== rule.targetColor));
      
      // To be tricky: Maybe make the TEXT match the target color? (False positive)
      const isTricky = Math.random() < 0.5;
      wordText = isTricky ? rule.targetColor : randomPick(ALL_COLORS);
    } else {
       // RuleType.MATCH_WORD
       // Text cannot be the target.
       wordText = randomPick(ALL_COLORS.filter(c => c !== rule.targetColor));
       
       // To be tricky: Maybe make the COLOR match the target word? (False positive)
       const isTricky = Math.random() < 0.5;
       displayColor = isTricky ? rule.targetColor : randomPick(ALL_COLORS);
    }
  }

  return { displayColor, wordText, isCorrect: mustBeCorrect };
};

export const regenerateRowItems = (
    rule: Rule,
    laneCount: number
): ObstacleItem[] => {
    const correctLane = Math.floor(Math.random() * laneCount);
    const items: ObstacleItem[] = [];
    for (let i = 0; i < laneCount; i++) {
        items.push(generateItem(i === correctLane, rule));
    }
    return items;
};

export const generateObstacleRow = (
  id: number, 
  rule: Rule, 
  setIndex: number,
  transitionZoneHeight: number = 0,
  totalInSet: number = 5,
  laneCount: number = 3
): ObstacleRow => {
  const items: (ObstacleItem | null)[] = regenerateRowItems(rule, laneCount);

  return {
    id,
    y: -20, // Start above screen
    items: items,
    passed: false,
    rule,
    setIndex,
    totalInSet,
    transitionZoneHeight,
    type: ObstacleType.STANDARD
  };
};

export const generateCrateRow = (
    id: number,
    rule: Rule,
    laneCount: number = 3,
    disabledPowerUps: PowerUpType[] = []
): ObstacleRow => {
    // 1. Pick empty lane (Skip path)
    const emptyLane = Math.floor(Math.random() * laneCount);
    
    // 2. Setup pool based on Mode and Disabled Settings
    let allEffects = [
        PowerUpType.SPEED, 
        PowerUpType.DRUNK, 
        PowerUpType.FOG, 
        PowerUpType.DYSLEXIA, 
        PowerUpType.GPS, 
        PowerUpType.BLOCKER,
        PowerUpType.WILD,
        PowerUpType.WARP
    ];

    if (rule.type === RuleType.MATCH_WORD) {
        allEffects.push(PowerUpType.GLITCH);
    }

    if (rule.type === RuleType.MATCH_COLOR) {
        allEffects.push(PowerUpType.BLEACH);
        allEffects.push(PowerUpType.ALIAS);
    }

    // Filter disabled
    if (disabledPowerUps.length > 0) {
        allEffects = allEffects.filter(eff => !disabledPowerUps.includes(eff));
    }

    // Return empty if no valid effects (shouldn't happen with min-3 constraint but safety check)
    if (allEffects.length === 0) {
         return {
            id,
            y: -20,
            items: Array(laneCount).fill(null),
            passed: false,
            rule,
            setIndex: 0,
            totalInSet: 0,
            transitionZoneHeight: 0,
            type: ObstacleType.CRATE
        };
    }

    // 3. Shuffle for randomness (Fisher-Yates)
    for (let i = allEffects.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allEffects[i], allEffects[j]] = [allEffects[j], allEffects[i]];
    }

    // 4. Fill Slots
    // Constraint: 1 lane MUST be empty. Occupied lanes must have DIFFERENT types.
    // So we need to fill (laneCount - 1) lanes with UNIQUE effects.
    const slotsToFill = Math.max(0, laneCount - 1);
    
    // Take as many unique effects as needed, limited by how many are available.
    const effectsToUse = allEffects.slice(0, Math.min(slotsToFill, allEffects.length));
    
    const items: (ObstacleItem | null)[] = Array(laneCount).fill(null);
    let effectIdx = 0;

    for (let i = 0; i < laneCount; i++) {
        if (i === emptyLane) {
            items[i] = null;
        } else {
            // Assign unique effect if available
            if (effectIdx < effectsToUse.length) {
                items[i] = {
                    displayColor: ColorType.GRAY,
                    wordText: ColorType.GRAY,
                    isCorrect: true,
                    effect: effectsToUse[effectIdx]
                };
                effectIdx++;
            } else {
                // If we ran out of unique effects (e.g. only 1 active crate in 4-lane mode),
                // this lane stays empty to prevent duplicates.
                items[i] = null;
            }
        }
    }

    return {
        id,
        y: -20,
        items,
        passed: false,
        rule,
        setIndex: 0, // 0 indicates special row
        totalInSet: 0, // Not applicable for crates
        transitionZoneHeight: 0,
        type: ObstacleType.CRATE
    };
}