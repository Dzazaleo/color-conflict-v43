
// ... (imports remain the same)
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Rule, RuleType, ObstacleRow, ColorType, ObstacleType, PowerUpType, FloatingText, AppSettings, PracticeConfig } from '../types';
import { INITIAL_SPEED, MAX_SPEED, MIN_OBSTACLE_DISTANCE, MAX_OBSTACLE_DISTANCE, PLAYER_Y_POS, HITBOX_THRESHOLD, OBSTACLES_PER_SET, COLOR_MAP, TRACK_THEMES, COLOR_ALIAS_MAP, ALL_COLORS, CRATE_METADATA } from '../constants';
import { generateRule, generateObstacleRow, generateCrateRow, regenerateRowItems } from '../utils/gameLogic';
import Car from './Car';
import Obstacle from './Obstacle';
import TutorialModal from './TutorialModal';
import { Palette, Type, Heart, TriangleAlert, Pause, Play, RotateCcw, Home, Settings, GraduationCap, Infinity, Hand } from 'lucide-react';
import clsx from 'clsx';
import { audioManager } from '../utils/audio';

interface GameProps {
  onGameOver: (score: number, time: number) => void;
  onScoreUpdate: (score: number) => void;
  onQuit: () => void;
  onRestart: () => void;
  isActive: boolean;
  score: number;
  highScore: number;
  settings: AppSettings;
  isSettingsOpen: boolean;
  onOpenSettings: () => void;
  practiceConfig?: PracticeConfig;
}

const Game: React.FC<GameProps> = ({ 
    onGameOver, onScoreUpdate, onQuit, onRestart, isActive, score, highScore, 
    settings, isSettingsOpen, onOpenSettings, practiceConfig
}) => {
  // ... (All state and refs remain unchanged until the render logic)
  const scoreRef = useRef(0);
  const totalTimeRef = useRef(0); // Track total gameplay time in ms
  const playerLivesRef = useRef(0); // Logic ref for lives to avoid stale closure issues in loop
  const levelRef = useRef(1); // Track current level based on score (Logic Level)
  const speedRef = useRef(INITIAL_SPEED);
  const obstaclesRef = useRef<ObstacleRow[]>([]);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  
  // Logic Refs (Stabilize animate loop)
  const displayedRuleRef = useRef<Rule | null>(null);
  const displayedProgressRef = useRef<number>(0);
  const isPausedRef = useRef(false); // Controls game loop pause for transitions
  const isTransitioningRef = useRef(false); // Explicit flag to halt spawning during complex transitions
  
  // WARP CHALLENGE STATE
  const warpStateRef = useRef<{
    active: boolean;
    phase: 'NONE' | 'RUN_1' | 'PREP_REVERSE' | 'RUN_2';
  }>({ active: false, phase: 'NONE' });

  // Rule & Spawning Logic Refs
  let initialRuleType = RuleType.MATCH_COLOR;

  if (practiceConfig?.mode === 'WORD_ONLY') {
      initialRuleType = RuleType.MATCH_WORD;
  } else if (practiceConfig?.mode === 'SINGLE_CRATE' && practiceConfig.selectedCrate) {
      if (practiceConfig.selectedCrate === PowerUpType.GLITCH) {
          initialRuleType = RuleType.MATCH_WORD;
      } else if (practiceConfig.selectedCrate === PowerUpType.BLEACH || practiceConfig.selectedCrate === PowerUpType.ALIAS) {
          initialRuleType = RuleType.MATCH_COLOR;
      }
  }
  
  const currentRuleRef = useRef<Rule>(generateRule(undefined, initialRuleType));
  const ruleHistoryRef = useRef<RuleType[]>([currentRuleRef.current.type]); // Track history
  const spawnCountRef = useRef(0); // Tracks current position in set (1 to totalInSet)
  
  // Level Progression Refs
  const objectivesSpawnedRef = useRef(0); // Total number of objective sets spawned
  const completedSetsRef = useRef(0); // Total number of objective sets completed by player
  const currentSetSizeRef = useRef(OBSTACLES_PER_SET); // Constant: 5

  // Tutorial Refs
  const hasSpawnedTutorialCrateRef = useRef(false);
  const tutorialSeenRef = useRef(false);
  
  // Practice Countdown Refs
  const postTutorialCountdownRef = useRef(false);
  const countdownStartTimeRef = useRef(0);
  const displayedCountdownTextRef = useRef<string | null>(null);
  
  // Practice Guidance Tracking
  const guidedSetsSpawnedRef = useRef(0);
  const guidedSetsCompletedRef = useRef(0);
  const warpSetsCompletedRef = useRef(0); // Track Warp Challenge completions in Practice

  // ALIAS Effect Refs
  const aliasSpinRuleRef = useRef<Rule | null>(null); // Overrides display rule during spin
  
  const lastSpawnYRef = useRef(100);
  const nextSpawnDistanceRef = useRef(Math.random() * (MAX_OBSTACLE_DISTANCE - MIN_OBSTACLE_DISTANCE) + MIN_OBSTACLE_DISTANCE);
  
  // React State for Rendering
  const [playerLane, setPlayerLane] = useState<number>(1);
  const [playerLives, setPlayerLives] = useState(0); // UI State for lives
  const [currentLevel, setCurrentLevel] = useState(1); // UI Display Level
  
  const [activeLaneCount, setActiveLaneCount] = useState(practiceConfig?.mode === 'FOUR_LANES' ? 4 : 3);
  
  const [renderObstacles, setRenderObstacles] = useState<ObstacleRow[]>([]);
  const [displayRule, setDisplayRule] = useState<Rule>(currentRuleRef.current);
  const [ruleProgress, setRuleProgress] = useState(0); // 0 to N
  const [ruleTotal, setRuleTotal] = useState(OBSTACLES_PER_SET);
  const [collisionFlash, setCollisionFlash] = useState<string | null>(null);
  const [levelAnnouncement, setLevelAnnouncement] = useState<number | null>(null);
  const [lifeAnnouncement, setLifeAnnouncement] = useState(false); // New overlay for +1 Life
  const [rulePulse, setRulePulse] = useState(false);
  const [warningState, setWarningState] = useState<{ visible: boolean; count: number }>({ visible: false, count: 0 });
  const [isMenuPaused, setIsMenuPaused] = useState(false);
  const [hudAliasWord, setHudAliasWord] = useState<string>(''); // For ALIAS effect
  const [warpMessage, setWarpMessage] = useState(false); // New state for WARP ACTIVE popup
  const [countdownDisplay, setCountdownDisplay] = useState<string | null>(null); // "3", "2", "1", "GO!"

  // Tutorial States
  const [introMessage, setIntroMessage] = useState<string | null>(null);
  const [activeTutorial, setActiveTutorial] = useState<PowerUpType | null>(null);

  // Power Up State
  const [activeEffect, setActiveEffect] = useState<PowerUpType>(PowerUpType.NONE);
  const [wildEffects, setWildEffects] = useState<PowerUpType[]>([]); // Sub-effects for WILD mode
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [lightningFlash, setLightningFlash] = useState(false);

  // New State for Animation Trigger on Hit
  const [hitTrigger, setHitTrigger] = useState(0);

  // Helper to check if a specific effect is active (either directly or via WILD)
  const isEffectActive = useCallback((type: PowerUpType) => {
      if (activeEffect === type) return true;
      if (activeEffect === PowerUpType.WILD && wildEffects.includes(type)) return true;
      return false;
  }, [activeEffect, wildEffects]);

  // ... (useEffect blocks remain unchanged)
  useEffect(() => {
    // Force reset audio state to ensure clean slate if recovering from crash/reload
    audioManager.reset();
    audioManager.startBGM(true);

    displayedRuleRef.current = currentRuleRef.current;
    
    setLevelAnnouncement(1);
    const t = setTimeout(() => setLevelAnnouncement(null), 1000);
    
    if (practiceConfig?.mode === 'SINGLE_CRATE' && practiceConfig.selectedCrate) {
        const crateLabel = CRATE_METADATA[practiceConfig.selectedCrate].label;
        setIntroMessage(`PRACTICE: ${crateLabel} CRATE`);
        const t2 = setTimeout(() => setIntroMessage(null), 3000);
        return () => { clearTimeout(t); clearTimeout(t2); };
    }

    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isActive) {
        audioManager.stopBGM();
        return;
    }
    if (isMenuPaused || isSettingsOpen) {
        audioManager.pauseGameAudio();
    } 
    else if (activeTutorial) {
        audioManager.resumeGameAudio();
        audioManager.startBGM(); 
        audioManager.setDucked(true);
    } 
    else {
        audioManager.resumeGameAudio();
        audioManager.startBGM(); 
        audioManager.setDucked(false);
    }
  }, [isActive, isMenuPaused, isSettingsOpen, activeTutorial]);

  useEffect(() => {
    return () => {
        audioManager.stopBGM();
    }
  }, []);

  useEffect(() => {
      audioManager.setRuleTheme(displayRule.type === RuleType.MATCH_WORD);
  }, [displayRule.type]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let flashTimeoutId: ReturnType<typeof setTimeout>;

    if (settings.visualFX && isEffectActive(PowerUpType.FOG) && !isMenuPaused && !isSettingsOpen && !activeTutorial) {
        const scheduleFlash = () => {
            const delay = Math.random() * 2500 + 1500;
            timeoutId = setTimeout(() => {
                setLightningFlash(true);
                flashTimeoutId = setTimeout(() => {
                    setLightningFlash(false);
                    scheduleFlash();
                }, 40);
            }, delay);
        };
        scheduleFlash();
    } else {
        setLightningFlash(false);
    }

    return () => {
        clearTimeout(timeoutId);
        clearTimeout(flashTimeoutId);
    };
  }, [activeEffect, wildEffects, isMenuPaused, isSettingsOpen, isEffectActive, settings.visualFX, activeTutorial]);

  const currentLaneCount = activeLaneCount;
  const activeTheme = TRACK_THEMES[displayRule.type];

  const togglePause = useCallback(() => {
      setIsMenuPaused(prev => !prev);
      if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50);
      }
  }, [settings.haptics]);
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isActive) return;

    if (e.key === 'Escape') {
        if (isSettingsOpen) onOpenSettings(); 
        else togglePause();
        return;
    }

    if (isPausedRef.current || isMenuPaused || isSettingsOpen || activeTutorial) return;
    
    const laneLimit = activeLaneCount - 1;

    if (e.key === 'ArrowLeft' || e.key === 'a') {
        setPlayerLane(prev => Math.max(0, prev - 1));
    } else if (e.key === 'ArrowRight' || e.key === 'd') {
        setPlayerLane(prev => Math.min(laneLimit, prev + 1));
    }
  }, [isActive, activeLaneCount, isMenuPaused, isSettingsOpen, togglePause, onOpenSettings, activeTutorial]);

  const handleLaneClick = (lane: number) => {
      if (!isActive || isPausedRef.current || isMenuPaused || isSettingsOpen || activeTutorial) return;
      
      const laneLimit = activeLaneCount - 1;
      const validLane = Math.min(Math.max(0, lane), laneLimit);
      
      if (isEffectActive(PowerUpType.DYSLEXIA)) {
          const totalLanes = activeLaneCount;
          const invertedLane = (totalLanes - 1) - validLane;
          setPlayerLane(invertedLane);
      } else {
          setPlayerLane(validLane);
      }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const addFloatingText = (x: number, y: number, text: string, color: string) => {
      const id = Date.now() + Math.random();
      setFloatingTexts(prev => [...prev, { id, x, y, text, color }]);
      setTimeout(() => {
          setFloatingTexts(prev => prev.filter(ft => ft.id !== id));
      }, 1000);
  };

  const startLaneExpansionSequence = useCallback((targetLevel: number) => {
      isPausedRef.current = true;
      setWarningState({ visible: true, count: 3 });
      
      let count = 3;
      audioManager.play('objective');

      const interval = setInterval(() => {
          count--;
          if (count > 0) {
             setWarningState({ visible: true, count });
             audioManager.play('objective');
          } else {
             clearInterval(interval);
             setWarningState({ visible: false, count: 0 });
             setActiveLaneCount(4);
             levelRef.current = targetLevel; 
             isPausedRef.current = false;
             isTransitioningRef.current = false;
          }
      }, 1000);
  }, []);

  const handleSetCompletion = useCallback((obs: ObstacleRow) => {
      const calculatedLevel = Math.floor(scoreRef.current / 50) + 1;
      
      if (warpStateRef.current.active && warpStateRef.current.phase === 'RUN_1') {
          if (obs.type === ObstacleType.STANDARD && obs.setIndex === obs.totalInSet) {
              warpStateRef.current.phase = 'PREP_REVERSE';
              audioManager.setWarpTransition(true);
              audioManager.rampToWarpSpeed(1.0);
              
              setTimeout(() => {
                  setWarpMessage(true);
                  warpStateRef.current.phase = 'RUN_2';
                  
                  obstaclesRef.current.forEach(o => {
                      o.passed = false;
                      o.items.forEach(item => {
                          if (item) item.isHit = false;
                      });
                  });

                  audioManager.setWarpTransition(false);
                  audioManager.setReverseMode(true);
                  audioManager.play('spin'); 

                  setTimeout(() => setWarpMessage(false), 1500);

              }, 1000);
          }
      }
      
      if (!warpStateRef.current.active && calculatedLevel > levelRef.current) {
          const isPractice4Lane = practiceConfig?.mode === 'FOUR_LANES';
          
          if (isPractice4Lane) {
               levelRef.current = calculatedLevel;
               setCurrentLevel(calculatedLevel);
               setLevelAnnouncement(calculatedLevel);
               audioManager.play('levelUp');
               setTimeout(() => setLevelAnnouncement(null), 1000);
          } 
          else {
              const isExpansion = (calculatedLevel % 3 === 0);
              const isContraction = (levelRef.current % 3 === 0);

              if (isExpansion) {
                   isTransitioningRef.current = true; 
                   setCurrentLevel(calculatedLevel);
                   setLevelAnnouncement(calculatedLevel);
                   audioManager.play('levelUp');
                   
                   setTimeout(() => {
                       setLevelAnnouncement(null);
                       obstaclesRef.current = [];
                       setRenderObstacles([]);
                       
                       lastSpawnYRef.current = 100;
                       spawnCountRef.current = OBSTACLES_PER_SET;

                       startLaneExpansionSequence(calculatedLevel);
                       
                       if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
                           navigator.vibrate(200);
                       }
                   }, 1000);
              } else {
                  if (isContraction) {
                      setActiveLaneCount(3);
                      setPlayerLane(prev => Math.min(prev, 2));

                      obstaclesRef.current = [];
                      setRenderObstacles([]);
                      
                      lastSpawnYRef.current = 100;
                      spawnCountRef.current = OBSTACLES_PER_SET;
                  }

                  levelRef.current = calculatedLevel;
                  setCurrentLevel(calculatedLevel);
                  
                  setLevelAnnouncement(calculatedLevel);
                  audioManager.play('levelUp');
                  setTimeout(() => {
                      setLevelAnnouncement(null);
                      if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
                           navigator.vibrate(200);
                      }
                  }, 1000);
              }
          }
      }

      if (obs.type === ObstacleType.STANDARD) {
           completedSetsRef.current += 1;
           const totalSets = completedSetsRef.current;
           
           if (totalSets % 3 === 0) {
               const lvl = Math.floor(scoreRef.current / 50) + 1;
               const baseVelocity = INITIAL_SPEED;
               const levelMultiplier = 1 + (0.15 * lvl);
               
               const newSpeed = baseVelocity * levelMultiplier;
               
               speedRef.current = Math.min(MAX_SPEED, newSpeed);
               
               addFloatingText(1, 60, "VELOCITY SURGE", "text-cyan-400");
               audioManager.play('objective'); 
           }
      }
      
      const isWarpPractice = practiceConfig?.mode === 'SINGLE_CRATE' && practiceConfig.selectedCrate === PowerUpType.WARP;
      
      // PRACTICE MODE GUIDANCE COMPLETION
      if (!isWarpPractice && practiceConfig?.isActive && hasSpawnedTutorialCrateRef.current && obs.isGuided && obs.setIndex === obs.totalInSet) {
          guidedSetsCompletedRef.current += 1;
          
          if (guidedSetsCompletedRef.current === 3) {
              setIntroMessage("GUIDANCE ENDED: You're on your own!");
              setTimeout(() => setIntroMessage(null), 4000);
          }
      }

      setActiveEffect(PowerUpType.NONE);
      setWildEffects([]);
      setHudAliasWord('');
      aliasSpinRuleRef.current = null;
      
      setFloatingTexts([]); 

  }, [startLaneExpansionSequence, settings.haptics, practiceConfig]);
  
  const getPointsForEffect = (eff: PowerUpType) => {
      return CRATE_METADATA[eff]?.score || 1;
  };

  const triggerAliasSpin = (originalColor: ColorType) => {
      audioManager.play('spin');
      setTimeout(() => {
          const r1 = generateRule({ type: RuleType.MATCH_COLOR, targetColor: originalColor }, RuleType.MATCH_COLOR);
          aliasSpinRuleRef.current = r1;
          const aliases = COLOR_ALIAS_MAP[r1.targetColor];
          if (aliases) setHudAliasWord(aliases[Math.floor(Math.random() * aliases.length)]);
      }, 0);

      setTimeout(() => {
          const r2 = generateRule({ type: RuleType.MATCH_COLOR, targetColor: originalColor }, RuleType.MATCH_COLOR);
          aliasSpinRuleRef.current = r2;
           const aliases = COLOR_ALIAS_MAP[r2.targetColor];
          if (aliases) setHudAliasWord(aliases[Math.floor(Math.random() * aliases.length)]);
      }, 150);

      setTimeout(() => {
          const finalRule = generateRule({ type: RuleType.MATCH_COLOR, targetColor: originalColor }, RuleType.MATCH_COLOR);
          aliasSpinRuleRef.current = null; 
          currentRuleRef.current = finalRule; 
          
          const laneCount = activeLaneCount; 
          obstaclesRef.current.forEach(obs => {
              if (!obs.passed && obs.type === ObstacleType.STANDARD) {
                  obs.rule = finalRule;
                  obs.items = regenerateRowItems(finalRule, laneCount);
              }
          });

          const aliases = COLOR_ALIAS_MAP[finalRule.targetColor];
          if (aliases) setHudAliasWord(aliases[Math.floor(Math.random() * aliases.length)]);
          setDisplayRule(finalRule); 
          displayedRuleRef.current = finalRule;

      }, 300);
  };

  const animate = useCallback((time: number) => {
    if (isMenuPaused || isSettingsOpen || activeTutorial) {
         lastTimeRef.current = time;
         requestRef.current = requestAnimationFrame(animate);
         return;
    }

    if (!lastTimeRef.current) lastTimeRef.current = time;
    
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    totalTimeRef.current += deltaTime;

    if (isPausedRef.current) {
        requestRef.current = requestAnimationFrame(animate);
        return;
    }

    const timeScale = Math.min(deltaTime / 16.67, 4.0);

    const isReverse = warpStateRef.current.phase === 'RUN_2';
    const effectiveSpeed = speedRef.current * (isEffectActive(PowerUpType.SPEED) ? 1.5 : 1.0) * (isReverse ? 0.5 : 1.0);
    const directionMultiplier = isReverse ? -1 : 1;

    obstaclesRef.current.forEach(obs => {
      obs.y += effectiveSpeed * timeScale * directionMultiplier;
    });

    let activeOffScreen = false;
    
    for (const obs of obstaclesRef.current) {
        if (warpStateRef.current.active && (warpStateRef.current.phase === 'RUN_1' || warpStateRef.current.phase === 'PREP_REVERSE')) {
        } else if (warpStateRef.current.phase === 'RUN_2') {
            if (obs.y <= -30) activeOffScreen = true;
        } else {
            if (obs.y >= 120) activeOffScreen = true;
        }
        if (activeOffScreen) break;
    }

    if (activeOffScreen) {
        obstaclesRef.current = obstaclesRef.current.filter(obs => {
            if (warpStateRef.current.active && (warpStateRef.current.phase === 'RUN_1' || warpStateRef.current.phase === 'PREP_REVERSE')) {
                return true; 
            }
            if (warpStateRef.current.phase === 'RUN_2') {
                return obs.y > -30; 
            }
            return obs.y < 120;
        });
    }

    if (!isReverse) {
        lastSpawnYRef.current += effectiveSpeed * timeScale;
    }

    if (postTutorialCountdownRef.current) {
        const elapsed = Date.now() - countdownStartTimeRef.current;
        if (elapsed < 3000) {
            const sec = Math.ceil((3000 - elapsed) / 1000).toString();
            if (displayedCountdownTextRef.current !== sec) {
                displayedCountdownTextRef.current = sec;
                setCountdownDisplay(sec);
            }
        } else {
            postTutorialCountdownRef.current = false;
            displayedCountdownTextRef.current = "GO!";
            setCountdownDisplay("GO!");
            setTimeout(() => setCountdownDisplay(null), 800);
            
            lastSpawnYRef.current = nextSpawnDistanceRef.current + 200; 
            spawnCountRef.current = 99; 
        }
    }

    if (!isTransitioningRef.current && !postTutorialCountdownRef.current && !isReverse && warpStateRef.current.phase !== 'PREP_REVERSE' && lastSpawnYRef.current > (-20 + nextSpawnDistanceRef.current)) {
       
       let newRow: ObstacleRow;
       let nextDist = Math.random() * (MAX_OBSTACLE_DISTANCE - MIN_OBSTACLE_DISTANCE) + MIN_OBSTACLE_DISTANCE;
       let transitionHeight = 0;
       
       const activeLanes = (practiceConfig?.mode === 'FOUR_LANES') 
           ? 4 
           : (levelRef.current % 3 === 0) ? 4 : 3;

       const setSize = OBSTACLES_PER_SET;

       if (practiceConfig?.mode === 'SINGLE_CRATE' && !hasSpawnedTutorialCrateRef.current) {
           const allTypes = Object.values(PowerUpType).filter(t => t !== PowerUpType.NONE);
           const disabledForTutorial = allTypes.filter(t => t !== practiceConfig.selectedCrate);
           
           newRow = generateCrateRow(Date.now(), currentRuleRef.current, activeLanes, disabledForTutorial);
           
           spawnCountRef.current = 99; 
           hasSpawnedTutorialCrateRef.current = true;
           
           nextDist = 150; 
       } 
       else {
            if (spawnCountRef.current === setSize) {
                objectivesSpawnedRef.current += 1;
                
                const skipCrates = practiceConfig?.mode === 'COLOR_ONLY' || practiceConfig?.mode === 'WORD_ONLY';

                if (skipCrates) {
                    spawnCountRef.current = 1;
                    
                    let forcedType: RuleType | undefined;
                    if (practiceConfig?.mode === 'COLOR_ONLY') forcedType = RuleType.MATCH_COLOR;
                    if (practiceConfig?.mode === 'WORD_ONLY') forcedType = RuleType.MATCH_WORD;
                    
                    const nextRule = generateRule(currentRuleRef.current, forcedType);
                    currentRuleRef.current = nextRule;
                    
                    transitionHeight = lastSpawnYRef.current - (-20); 
                    newRow = generateObstacleRow(Date.now(), currentRuleRef.current, 1, transitionHeight, setSize, activeLanes);
                    
                    nextDist += (effectiveSpeed * 60);

                } else {
                    spawnCountRef.current = 99; 
                    
                    const history = ruleHistoryRef.current;
                    let forcedType: RuleType | undefined;
                    
                    if (practiceConfig?.mode === 'COLOR_ONLY') forcedType = RuleType.MATCH_COLOR;
                    else if (practiceConfig?.mode === 'WORD_ONLY') forcedType = RuleType.MATCH_WORD;
                    else {
                        if (practiceConfig?.mode === 'SINGLE_CRATE' && practiceConfig.selectedCrate) {
                                if (practiceConfig.selectedCrate === PowerUpType.GLITCH) {
                                    forcedType = RuleType.MATCH_WORD;
                                } else if (practiceConfig.selectedCrate === PowerUpType.BLEACH || practiceConfig.selectedCrate === PowerUpType.ALIAS) {
                                    forcedType = RuleType.MATCH_COLOR;
                                }
                        }

                        if (!forcedType) {
                            if (history.length >= 2) {
                                const last = history[history.length - 1];
                                const secondLast = history[history.length - 2];
                                if (last === RuleType.MATCH_COLOR && secondLast === RuleType.MATCH_COLOR) {
                                    forcedType = RuleType.MATCH_WORD;
                                } else if (last === RuleType.MATCH_WORD && secondLast === RuleType.MATCH_WORD) {
                                    forcedType = RuleType.MATCH_COLOR;
                                }
                            }
                        }
                    }

                    const nextRule = generateRule(currentRuleRef.current, forcedType);
                    
                    let disabledCrates: PowerUpType[] = [];
                    
                    if (practiceConfig?.mode === 'SINGLE_CRATE' && practiceConfig.selectedCrate) {
                        const allCrates = Object.values(PowerUpType).filter(t => t !== PowerUpType.NONE);
                        disabledCrates = allCrates.filter(t => t !== practiceConfig.selectedCrate);
                    } else {
                        disabledCrates = Object.entries(settings.crateToggles)
                                .filter(([_, enabled]) => !enabled)
                                .map(([type]) => type as PowerUpType);
                    }

                    newRow = generateCrateRow(Date.now(), nextRule, activeLanes, disabledCrates);
                    
                    currentRuleRef.current = nextRule;
                    
                    ruleHistoryRef.current.push(nextRule.type);
                    if (ruleHistoryRef.current.length > 2) {
                        ruleHistoryRef.current.shift();
                    }
                    
                    nextDist += (effectiveSpeed * 30); 
                }

            } else if (spawnCountRef.current === 99) {
                spawnCountRef.current = 1;
                transitionHeight = lastSpawnYRef.current - (-20);
                newRow = generateObstacleRow(Date.now(), currentRuleRef.current, 1, transitionHeight, setSize, activeLanes);
                
                if (practiceConfig?.isActive && hasSpawnedTutorialCrateRef.current) {
                    guidedSetsSpawnedRef.current += 1;
                }

            } else {
                spawnCountRef.current += 1;
                newRow = generateObstacleRow(Date.now(), currentRuleRef.current, spawnCountRef.current, 0, setSize, activeLanes);
                
                if (spawnCountRef.current === setSize) {
                        const nextSetNum = objectivesSpawnedRef.current + 1;
                        if (nextSetNum % 3 === 0) {
                            nextDist = 120 + (speedRef.current * 100);
                        } else {
                            nextDist += (effectiveSpeed * 60);
                        }
                }
            }
       }
       
       let shouldGuide = false;
       if (practiceConfig?.isActive && hasSpawnedTutorialCrateRef.current && newRow.type === ObstacleType.STANDARD) {
           if (practiceConfig.mode === 'SINGLE_CRATE' && practiceConfig.selectedCrate === PowerUpType.WARP) {
               shouldGuide = warpSetsCompletedRef.current < 1;
           } else {
               shouldGuide = guidedSetsSpawnedRef.current <= 3;
           }
       }

       if (shouldGuide) {
           newRow.isGuided = true;
       }
       
       obstaclesRef.current.push(newRow);
       lastSpawnYRef.current = -20;
       
       nextSpawnDistanceRef.current = nextDist;
    }

    let targetRule = currentRuleRef.current;
    let targetProgress = 0;
    let targetTotal = OBSTACLES_PER_SET;

    if (aliasSpinRuleRef.current) {
        targetRule = aliasSpinRuleRef.current;
        targetProgress = 0;
    } else {
        const upcomingObstacle = obstaclesRef.current.find(obs => !obs.passed && obs.type === ObstacleType.STANDARD && obs.y > -20 && obs.y < 85);
        
        if (upcomingObstacle) {
            targetRule = upcomingObstacle.rule;
            targetProgress = upcomingObstacle.setIndex - 1;
            targetTotal = upcomingObstacle.totalInSet; 
        } else {
            targetRule = currentRuleRef.current;
            targetProgress = 0;
            targetTotal = OBSTACLES_PER_SET;
        }
    }

    if (displayedRuleRef.current !== targetRule) {
        displayedRuleRef.current = targetRule;
        setDisplayRule(targetRule);
        setRulePulse(true);
        audioManager.play('objective');
        
        if (!aliasSpinRuleRef.current && (isEffectActive(PowerUpType.ALIAS) || (targetRule.type === RuleType.MATCH_COLOR && isEffectActive(PowerUpType.ALIAS)))) {
             const aliases = COLOR_ALIAS_MAP[targetRule.targetColor];
             if (aliases) {
                 setHudAliasWord(aliases[Math.floor(Math.random() * aliases.length)]);
             }
        }
        
        setTimeout(() => setRulePulse(false), 300);
    }
    if (displayedProgressRef.current !== targetProgress) {
        displayedProgressRef.current = targetProgress;
        setRuleProgress(targetProgress);
    }
    if (targetTotal !== ruleTotal) {
        setRuleTotal(targetTotal);
    }

    for (const obs of obstaclesRef.current) {
        if (!obs.passed) {
            let hit = false;
            let success = false;
            let hitCrate = false;
            let hitEffect: PowerUpType = PowerUpType.NONE;

            const inHitZone = Math.abs(obs.y - PLAYER_Y_POS) < HITBOX_THRESHOLD;
            
            if (inHitZone) {
                hit = true;
                const currentLane = playerLaneRef.current;
                
                const hitItem = obs.items[currentLane];
                
                if (hitItem === undefined) {
                    hit = false;
                } else {
                    if (obs.type === ObstacleType.CRATE) {
                        hitCrate = true;
                        if (hitItem && hitItem.effect) {
                            hitEffect = hitItem.effect;
                            success = true;
                        } else {
                            success = true; 
                            hit = false;
                        }
                    } else {
                        if (hitItem) success = hitItem.isCorrect;
                    }
                }
            } 
            else {
                if (isReverse) {
                    if (obs.y < PLAYER_Y_POS - HITBOX_THRESHOLD) {
                        obs.passed = true;
                    }
                } else {
                    if (obs.y > PLAYER_Y_POS + HITBOX_THRESHOLD) {
                        obs.passed = true;
                        if (obs.type === ObstacleType.STANDARD) {
                            if (obs.setIndex === obs.totalInSet) {
                                handleSetCompletion(obs);
                            }
                        }
                    }
                }
            }

            if (hit) {
                if (success) {
                    const currentLane = playerLaneRef.current;
                    const hitItem = obs.items[currentLane];
                    
                    if (hitItem) hitItem.isHit = true;

                    obs.passed = true;
                    
                    if (hitCrate) {
                        // PRACTICE MODE INTERCEPT
                        if (practiceConfig?.mode === 'SINGLE_CRATE' && !tutorialSeenRef.current && hitEffect !== PowerUpType.NONE) {
                             setActiveTutorial(hitEffect);
                             tutorialSeenRef.current = true;
                        }

                        if (hitEffect !== PowerUpType.NONE) {
                            if (hitEffect === PowerUpType.WARP) {
                                warpStateRef.current = { active: true, phase: 'RUN_1' };
                                audioManager.play('crate');
                                addFloatingText(playerLaneRef.current, 80, "WARP INITIATED", "text-fuchsia-400");
                            } 
                            else if (hitEffect === PowerUpType.WILD) {
                                const possibleEffects = [
                                    PowerUpType.SPEED, PowerUpType.DRUNK, PowerUpType.FOG, 
                                    PowerUpType.DYSLEXIA, PowerUpType.GPS, PowerUpType.BLOCKER
                                ];
                                
                                if (displayRule.type === RuleType.MATCH_WORD) possibleEffects.push(PowerUpType.GLITCH);
                                if (displayRule.type === RuleType.MATCH_COLOR) {
                                    possibleEffects.push(PowerUpType.BLEACH);
                                    possibleEffects.push(PowerUpType.ALIAS);
                                }
                                
                                const disabledCrates = Object.entries(settings.crateToggles)
                                    .filter(([_, enabled]) => !enabled)
                                    .map(([type]) => type as PowerUpType);
                                
                                const filteredPossible = possibleEffects.filter(e => !disabledCrates.includes(e));
                                const finalPool = filteredPossible.length >= 2 ? filteredPossible : possibleEffects;

                                for (let i = finalPool.length - 1; i > 0; i--) {
                                    const j = Math.floor(Math.random() * (i + 1));
                                    [finalPool[i], finalPool[j]] = [finalPool[j], finalPool[i]];
                                }
                                const wildCombo = finalPool.slice(0, 2);
                                
                                setActiveEffect(PowerUpType.WILD);
                                setWildEffects(wildCombo);
                                
                                if (wildCombo.includes(PowerUpType.ALIAS)) {
                                     triggerAliasSpin(displayRule.targetColor);
                                }

                                audioManager.play('wild'); 
                                addFloatingText(playerLaneRef.current, 80, "WILD MODE!", "text-white");
                                addFloatingText(playerLaneRef.current, 90, "DOUBLE EFFECT!", "text-yellow-400");
                            } 
                            else {
                                setActiveEffect(hitEffect);
                                setWildEffects([]);
                                audioManager.play('crate'); 

                                let txt = "SPEED UP!";
                                let col = "text-yellow-400";
                                
                                if (hitEffect === PowerUpType.DRUNK) { txt = "DRUNK MODE!"; col = "text-purple-400"; } 
                                else if (hitEffect === PowerUpType.FOG) { txt = "STORM MODE!"; col = "text-slate-300"; } 
                                else if (hitEffect === PowerUpType.DYSLEXIA) { txt = "INPUT SWAP!"; col = "text-orange-400"; } 
                                else if (hitEffect === PowerUpType.GPS) { txt = "GPS ACTIVE!"; col = "text-teal-400"; } 
                                else if (hitEffect === PowerUpType.BLOCKER) { txt = "VISION BLOCKED!"; col = "text-amber-500"; } 
                                else if (hitEffect === PowerUpType.GLITCH) { txt = "TEXT CORRUPT!"; col = "text-lime-400"; } 
                                else if (hitEffect === PowerUpType.BLEACH) { txt = "COLOR WASH!"; col = "text-red-500"; } 
                                else if (hitEffect === PowerUpType.ALIAS) { txt = "ALIAS MODE!"; col = "text-indigo-400"; triggerAliasSpin(displayRule.targetColor); }
                                
                                addFloatingText(playerLaneRef.current, 80, txt, col);
                            }
                        }
                    } else {
                        let points = 0;
                        let pointColor = "text-white";
                        
                        if (isReverse) {
                            points = 6;
                            pointColor = "text-fuchsia-400";
                            
                            audioManager.play('warpHit', obs.setIndex);

                        } 
                        else if (activeEffect === PowerUpType.WILD) {
                            points = getPointsForEffect(wildEffects[0]) + getPointsForEffect(wildEffects[1]);
                            pointColor = "text-yellow-200"; 
                        } else {
                            points = getPointsForEffect(activeEffect);
                             if (activeEffect === PowerUpType.DRUNK) pointColor = "text-purple-400";
                             else if (activeEffect === PowerUpType.FOG) pointColor = "text-slate-400";
                             else if (activeEffect === PowerUpType.SPEED) pointColor = "text-yellow-400";
                             else if (activeEffect === PowerUpType.DYSLEXIA) pointColor = "text-orange-400";
                             else if (activeEffect === PowerUpType.BLOCKER) pointColor = "text-amber-500";
                             else if (activeEffect === PowerUpType.GLITCH) pointColor = "text-lime-400";
                             else if (activeEffect === PowerUpType.BLEACH) pointColor = "text-red-500";
                             else if (activeEffect === PowerUpType.ALIAS) pointColor = "text-indigo-400";
                        }
                        
                        const oldScore = scoreRef.current;
                        scoreRef.current += points;
                        onScoreUpdate(scoreRef.current);

                        setHitTrigger(prev => prev + 1);
                        
                        if (Math.floor(scoreRef.current / 50) > Math.floor(oldScore / 50)) {
                             playerLivesRef.current += 1;
                             setPlayerLives(playerLivesRef.current);
                             setLifeAnnouncement(true);
                             audioManager.play('lifeUp'); 
                             setTimeout(() => setLifeAnnouncement(false), 1000);
                        }
                        
                        addFloatingText(playerLaneRef.current, 85, `+${points}`, pointColor);

                        setCollisionFlash('green');
                        setTimeout(() => setCollisionFlash(null), 150);
                        
                        if (!isReverse && obs.setIndex === obs.totalInSet) {
                             handleSetCompletion(obs);
                        }

                        if (isReverse && obs.setIndex === 1) {
                            warpStateRef.current = { active: false, phase: 'NONE' };
                            audioManager.setReverseMode(false);
                            audioManager.play('levelUp');
                            addFloatingText(playerLaneRef.current, 70, "LOOP CLOSED", "text-white");
                            
                            obstaclesRef.current = []; 
                            lastSpawnYRef.current = 100;
                            
                            // Warp Practice Completion
                            if (practiceConfig?.mode === 'SINGLE_CRATE' && practiceConfig.selectedCrate === PowerUpType.WARP) {
                                warpSetsCompletedRef.current += 1;
                                if (warpSetsCompletedRef.current === 1) {
                                    setIntroMessage("GUIDANCE ENDED: You're on your own!");
                                    setTimeout(() => setIntroMessage(null), 3000);
                                }
                            }
                        }
                    }

                } else {
                    if (playerLivesRef.current > 0) {
                        playerLivesRef.current -= 1;
                        setPlayerLives(playerLivesRef.current);
                        
                        audioManager.play('life');
                        obs.passed = true;
                        
                        setCollisionFlash('white');
                        setTimeout(() => setCollisionFlash(null), 150);
                        addFloatingText(playerLaneRef.current, 85, "SAVED!", "text-white");
                        
                        if (!isReverse && obs.type === ObstacleType.STANDARD && obs.setIndex === obs.totalInSet) {
                             handleSetCompletion(obs);
                        }
                        
                        if (isReverse && obs.setIndex === 1) {
                             warpStateRef.current = { active: false, phase: 'NONE' };
                             audioManager.setReverseMode(false);
                             obstaclesRef.current = [];
                             lastSpawnYRef.current = 100;
                        }
                        
                    } else {
                        setCollisionFlash('red');
                        audioManager.play('wrong'); 
                        
                        if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
                             navigator.vibrate(800);
                        }
                        
                        warpStateRef.current = { active: false, phase: 'NONE' };
                        audioManager.setReverseMode(false);

                        onGameOver(scoreRef.current, totalTimeRef.current);
                        if (requestRef.current) cancelAnimationFrame(requestRef.current);
                        return; 
                    }
                }
            }
        }
    }

    setRenderObstacles([...obstaclesRef.current]);
    
    requestRef.current = requestAnimationFrame(animate);
  }, [onGameOver, onScoreUpdate, activeEffect, wildEffects, ruleTotal, handleSetCompletion, isMenuPaused, isSettingsOpen, isEffectActive, displayRule.type, displayRule.targetColor, settings.haptics, settings.crateToggles, practiceConfig, activeTutorial]);

  const playerLaneRef = useRef(playerLane);
  useEffect(() => {
      playerLaneRef.current = playerLane;
  }, [playerLane]);

  useEffect(() => {
    if (isActive) {
        requestRef.current = requestAnimationFrame(animate);
    } else {
        setActiveEffect(PowerUpType.NONE);
        setWildEffects([]);
        warpStateRef.current = { active: false, phase: 'NONE' };
        audioManager.setReverseMode(false);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, animate]);


  const isColorRule = displayRule.type === RuleType.MATCH_COLOR;
  
  const getHudTargetColor = (color: ColorType) => {
      if (isEffectActive(PowerUpType.ALIAS)) {
          return '#000000';
      }
      if (color === ColorType.WHITE) return '#000000'; 
      return COLOR_MAP[color];
  };

  const hudText = isEffectActive(PowerUpType.ALIAS) && hudAliasWord ? hudAliasWord : displayRule.targetColor;

  const getGpsTargetLane = () => {
      let target: ObstacleRow | null = null;
      let maxY = -999;
      
      renderObstacles.forEach(o => {
          if (!o.passed && o.type === ObstacleType.STANDARD && o.y > -20 && o.y < 90) {
              if (o.y > maxY) {
                  maxY = o.y;
                  target = o;
              }
          }
      });
      
      if (target) {
          // @ts-ignore
           return (target as ObstacleRow).items.findIndex(i => i?.isCorrect);
      }
      return -1;
  };
  const gpsTargetLane = isEffectActive(PowerUpType.GPS) ? getGpsTargetLane() : -1;
  
  const getGuidanceState = () => {
      let target: ObstacleRow | null = null;
      let maxY = -999;
      
      renderObstacles.forEach(o => {
          if (!o.passed && o.isGuided && o.y < PLAYER_Y_POS + HITBOX_THRESHOLD) {
               if (o.y > maxY) {
                   maxY = o.y;
                   target = o;
               }
          }
      });
      
      if (target) {
           const laneIdx = (target as ObstacleRow).items.findIndex(i => i?.isCorrect);
           return laneIdx;
      }
      return -1;
  }
  
  const guidanceTargetLane = getGuidanceState();
  
  const showTapGuidance = guidanceTargetLane !== -1 && 
                          guidanceTargetLane !== playerLane && 
                          isEffectActive(PowerUpType.DYSLEXIA);

  const isDrunkEffect = settings.visualFX && isEffectActive(PowerUpType.DRUNK);
  const isFogEffect = settings.visualFX && isEffectActive(PowerUpType.FOG);
  const isWarpReverse = warpStateRef.current.phase === 'RUN_2';
  const isWarpActive = warpStateRef.current.active;

  return (
    <div className={clsx("relative w-full h-full overflow-hidden transition-all duration-700 ease-in-out", activeTheme.bg, activeTheme.ambient)}>
      
      <style>{`
          @keyframes rain {
            from { background-position: 0 0; }
            to { background-position: 0 300px; }
          }
          @keyframes drunk-sway {
            0% { transform: scale(1.05) rotate(0deg) skewX(0deg); }
            20% { transform: scale(1.05) rotate(2deg) skewX(1deg); }
            40% { transform: scale(1.05) rotate(-1deg) skewX(-2deg); }
            60% { transform: scale(1.05) rotate(-2deg) skewX(1deg); }
            80% { transform: scale(1.05) rotate(1deg) skewX(-1deg); }
            100% { transform: scale(1.05) rotate(0deg) skewX(0deg); }
          }
          @keyframes dot-ripple {
            0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(34,211,238,0.8); }
            100% { transform: scale(3); opacity: 0; box-shadow: 0 0 0 6px rgba(34,211,238,0); }
          }
          @keyframes dot-ripple-orange {
            0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(249,115,22,0.8); }
            100% { transform: scale(3); opacity: 0; box-shadow: 0 0 0 6px rgba(249,115,22,0); }
          }
          @keyframes rewind-scan {
            0% { background-position: 0 0; opacity: 0.1; }
            50% { opacity: 0.2; }
            100% { background-position: 0 -50px; opacity: 0.1; }
          }
          @keyframes gps-scroll {
            from { background-position: center 80px; }
            to { background-position: center 0px; }
          }
          @keyframes powerup-pop {
            0% { transform: scale(0.8); filter: brightness(1); }
            40% { transform: scale(1.15); filter: brightness(2); }
            100% { transform: scale(0.8); filter: brightness(1); }
          }
          @keyframes shockwave-ring {
            0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; border-width: 4px; }
            100% { transform: translate(-50%, -50%) scale(2.0); opacity: 0; border-width: 0px; }
          }
          @keyframes bounce-slow {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
      `}</style>
      
      <svg width="0" height="0" className="absolute pointer-events-none">
          <defs>
              <filter id="drunk-vision" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
                  <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="R"/>
                  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="G"/>
                  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="B"/>
                  <feOffset in="R" dx="-7.5" dy="0" result="R_off"/>
                  <feOffset in="B" dx="7.5" dy="0" result="B_off"/>
                  <feBlend in="R_off" in2="G" mode="screen" result="RG"/>
                  <feBlend in="RG" in2="B_off" mode="screen" result="RGB"/>
                  <feTurbulence type="fractalNoise" baseFrequency="0.01 0.04" numOctaves="1" result="NOISE" seed="0">
                       <animate attributeName="baseFrequency" values="0.01 0.04; 0.01 0.08; 0.01 0.04" dur="8s" repeatCount="indefinite" />
                  </feTurbulence>
                  <feDisplacementMap in="RGB" in2="NOISE" scale="19" xChannelSelector="R" yChannelSelector="G" />
              </filter>
          </defs>
      </svg>
    
      <div 
        className={clsx(
          "absolute inset-0 w-full h-full transition-transform duration-300",
          isEffectActive(PowerUpType.DYSLEXIA) && "scale-x-[-1]"
        )}
      >
          {lightningFlash && settings.visualFX && (
              <div className="absolute inset-0 z-50 pointer-events-none bg-white/90 animate-pulse"></div>
          )}

          <div 
            className={clsx(
              "absolute inset-0 w-full h-full transition-all duration-700 ease-in-out",
              isDrunkEffect && "animate-pulse blur-[1px] hue-rotate-15"
            )}
            style={{
                maskImage: isFogEffect
                    ? 'linear-gradient(to top, black 40%, transparent 95%)' 
                    : 'none',
                WebkitMaskImage: isFogEffect
                    ? 'linear-gradient(to top, black 40%, transparent 95%)' 
                    : 'none',
                animation: isDrunkEffect ? 'drunk-sway 6s ease-in-out infinite' : 'none'
            }}
          >
                {isWarpActive && (
                    <div className="absolute inset-0 z-0 pointer-events-none">
                        <div className="absolute inset-0 bg-fuchsia-900/20 mix-blend-overlay" />
                        <div 
                            className="absolute inset-0"
                            style={{
                                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(216, 27, 96, 0.3) 4px, rgba(216, 27, 96, 0.3) 8px)',
                                backgroundSize: '100% 100%',
                                animation: 'rewind-scan 0.3s linear infinite'
                            }}
                        />
                    </div>
                )}

                {isFogEffect && (
                    <>
                        <div className="absolute inset-0 z-20 pointer-events-none opacity-80" 
                             style={{ 
                                 backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='20' y='10' width='1' height='15' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='60' y='40' width='1' height='12' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='90' y='5' width='1' height='18' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='40' y='70' width='1' height='10' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='10' y='30' width='1' height='14' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='80' y='80' width='1' height='12' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='30' y='50' width='1' height='16' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='50' y='20' width='1' height='11' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='15' y='60' width='1' height='13' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='70' y='15' width='1' height='14' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='5' y='90' width='1' height='12' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='95' y='35' width='1' height='15' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='25' y='85' width='1' height='11' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='55' y='95' width='1' height='13' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='45' y='5' width='1' height='16' fill='rgba(200,220,255,0.6)' /%3E%3Crect x='85' y='55' width='1' height='14' fill='rgba(200,220,255,0.6)' /%3E%3C/svg%3E")`,
                                 backgroundSize: '300px 300px',
                                 animation: 'rain 0.4s linear infinite',
                                 transform: 'rotate(-10deg) scale(1.2)'
                             }} 
                        />
                         <div className="absolute inset-0 z-20 pointer-events-none opacity-[0.45]" 
                             style={{ 
                                 backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='10' y='20' width='2' height='10' fill='rgba(255,255,255,0.5)' /%3E%3Crect x='70' y='60' width='2' height='10' fill='rgba(255,255,255,0.5)' /%3E%3Crect x='40' y='10' width='2' height='10' fill='rgba(255,255,255,0.5)' /%3E%3Crect x='90' y='80' width='2' height='10' fill='rgba(255,255,255,0.5)' /%3E%3Crect x='25' y='45' width='2' height='10' fill='rgba(255,255,255,0.5)' /%3E%3Crect x='55' y='90' width='2' height='10' fill='rgba(255,255,255,0.5)' /%3E%3Crect x='85' y='15' width='2' height='10' fill='rgba(255,255,255,0.5)' /%3E%3Crect x='5' y='75' width='2' height='10' fill='rgba(255,255,255,0.5)' /%3E%3C/svg%3E")`,
                                 backgroundSize: '400px 400px',
                                 animation: 'rain 0.8s linear infinite',
                                 transform: 'rotate(-10deg) scale(1.2)'
                             }} 
                        />
                    </>
                )}

                <div className="absolute inset-0 flex opacity-30 pointer-events-none transition-all duration-700 ease-in-out">
                    {Array.from({ length: currentLaneCount }).map((_, i) => (
                        <div key={i} className={clsx("h-full border-r border-dashed flex-1 transition-colors duration-700", activeTheme.laneBorder, i === currentLaneCount - 1 && "border-r-0")} />
                    ))}
                </div>
                
                {isEffectActive(PowerUpType.GPS) && gpsTargetLane !== -1 && (
                     <div className="absolute inset-0 flex pointer-events-none z-0">
                         {Array.from({ length: currentLaneCount }).map((_, i) => (
                             <div 
                               key={i} 
                               className={clsx(
                                   "flex-1 h-full transition-all duration-300 relative",
                                   i === gpsTargetLane ? "bg-teal-500/10 shadow-[inset_0_0_50px_rgba(45,212,191,0.15)]" : "opacity-0"
                               )}
                             >
                                 {i === gpsTargetLane && (
                                     <div 
                                        className="absolute inset-0 opacity-80"
                                        style={{
                                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='80' viewBox='0 0 40 80' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5 50 L20 20 L35 50' stroke='%232dd4bf' stroke-width='4' stroke-linecap='round' stroke-linejoin='miter' stroke-opacity='0.8'/%3E%3C/svg%3E")`,
                                            backgroundPosition: 'center',
                                            backgroundRepeat: 'repeat-y',
                                            backgroundSize: '40px 80px',
                                            animation: 'gps-scroll 0.5s linear infinite'
                                        }}
                                     />
                                 )}
                             </div>
                         ))}
                    </div>
                )}
                
                <div className="absolute inset-0 flex z-30">
                    {Array.from({ length: currentLaneCount }).map((_, i) => (
                         <div 
                           key={i} 
                           className="flex-1 h-full cursor-pointer hover:bg-white/5 transition-colors active:bg-white/10" 
                           onClick={() => handleLaneClick(i)} 
                         />
                    ))}
                </div>

                <Car 
                    lane={playerLane} 
                    laneCount={currentLaneCount} 
                    ruleType={displayRule.type} 
                    visualFX={settings.visualFX} 
                    hitTrigger={hitTrigger}
                />
                
                {renderObstacles.map((obs, i) => (
                    <Obstacle 
                        key={obs.id} 
                        obstacle={obs} 
                        activeEffect={activeEffect} 
                        wildEffects={wildEffects}
                        visualFX={settings.visualFX} 
                        isWarpGhost={isWarpReverse && obs.type === ObstacleType.STANDARD}
                        shouldHighlightGuided={
                            (practiceConfig?.mode === 'SINGLE_CRATE' && practiceConfig.selectedCrate === PowerUpType.WARP) 
                                ? warpStateRef.current.active 
                                : true
                        }
                        showWarpGuidance={
                            practiceConfig?.mode === 'SINGLE_CRATE' && 
                            practiceConfig.selectedCrate === PowerUpType.WARP && 
                            warpSetsCompletedRef.current < 1 && 
                            warpStateRef.current.active
                        }
                        zIndex={renderObstacles.length - i}
                    />
                ))}

                {floatingTexts.map(ft => (
                    <div 
                        key={ft.id}
                        className="absolute z-50 pointer-events-none"
                        style={{ 
                            left: `${((ft.x + 0.5) / currentLaneCount) * 100}%`, 
                            top: `${ft.y}%`,
                            transform: isEffectActive(PowerUpType.DYSLEXIA) 
                                ? 'translate(-50%, -50%) scaleX(-1)' 
                                : 'translate(-50%, -50%)'
                        }}
                    >
                        <div className={clsx("font-black text-2xl animate-bounce drop-shadow-lg", ft.color)}>
                            {ft.text}
                        </div>
                    </div>
                ))}
          </div>
      </div>
      
      {countdownDisplay && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none">
              {practiceConfig?.isActive && (
                  <div className="mb-4 bg-slate-900/80 px-4 py-2 rounded-full border border-yellow-500/50 backdrop-blur-md animate-in slide-in-from-top-4 fade-in duration-300">
                      <span className="text-yellow-400 font-bold text-sm tracking-widest uppercase">
                          {(practiceConfig.mode === 'SINGLE_CRATE' && practiceConfig.selectedCrate === PowerUpType.WARP) 
                            ? "WARP GUIDANCE ACTIVE" 
                            : "3-SET GUIDANCE ACTIVE"
                          }
                      </span>
                  </div>
              )}
              <div 
                key={countdownDisplay} 
                className="text-8xl font-black text-white italic tracking-tighter drop-shadow-[0_0_40px_rgba(34,211,238,0.6)] animate-in zoom-in fade-in duration-300"
              >
                  {countdownDisplay}
              </div>
          </div>
      )}
      
      {showTapGuidance && (
          <div 
            className="absolute z-40 flex flex-col items-center pointer-events-none animate-[bounce-slow_1.5s_infinite]"
            style={{
                top: '65%', // Position above the player car
                left: `${((guidanceTargetLane + 0.5) / currentLaneCount) * 100}%`,
                transform: 'translateX(-50%)'
            }}
          >
              <div className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]">
                  <Hand className="w-12 h-12 fill-yellow-400 rotate-180" />
              </div>
              <div className="mt-2 bg-yellow-500/90 text-black font-black text-sm px-3 py-1 rounded-full uppercase tracking-widest shadow-[0_0_15px_rgba(234,179,8,0.6)]">
                  Tap Here
              </div>
          </div>
      )}
      
      {collisionFlash && settings.visualFX && (
          <div className={clsx(
              "absolute inset-0 z-50 pointer-events-none transition-opacity duration-150",
              collisionFlash === 'green' 
                ? 'bg-green-500 opacity-30' 
                : collisionFlash === 'white' 
                    ? 'bg-white opacity-60'
                    : 'bg-red-600 opacity-30'
          )} />
      )}

      {introMessage && (
          <div className="absolute top-[20%] left-0 right-0 z-50 flex items-center justify-center pointer-events-none animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="bg-slate-900/80 px-4 py-2 rounded-full border border-yellow-500/50 backdrop-blur-md shadow-lg">
                   <div className="text-yellow-400 font-bold text-sm tracking-widest uppercase text-center">
                       {introMessage}
                   </div>
              </div>
          </div>
      )}

      {activeTutorial && (
          <TutorialModal 
              effect={activeTutorial}
              onContinue={() => {
                  setActiveTutorial(null);
                  isPausedRef.current = false; 
                  lastTimeRef.current = 0; 
                  
                  if (speedRef.current <= 0) speedRef.current = INITIAL_SPEED;

                  postTutorialCountdownRef.current = true;
                  countdownStartTimeRef.current = Date.now();
                  displayedCountdownTextRef.current = "3";
                  setCountdownDisplay("3");
              }}
          />
      )}

      {levelAnnouncement && (
         <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
             <div className="w-full bg-slate-900/80 backdrop-blur-md py-4 border-y border-white/20 animate-in zoom-in fade-in slide-in-from-bottom-10 duration-200 flex flex-col items-center">
                 <div className="text-[10px] font-bold tracking-[0.5em] text-cyan-400 uppercase mb-1">Entering</div>
                 <div className="text-4xl font-black italic tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                     LEVEL {levelAnnouncement}
                 </div>
             </div>
         </div>
      )}

      {warningState.visible && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-4 animate-pulse">
                  <div className="flex items-center gap-2 text-yellow-500">
                      <TriangleAlert className="w-12 h-12 fill-yellow-500/20" />
                      <span className="text-3xl font-black uppercase tracking-widest italic">WARNING</span>
                      <TriangleAlert className="w-12 h-12 fill-yellow-500/20" />
                  </div>
                  <div className="text-xl font-bold text-white tracking-[0.5em] uppercase border-y border-yellow-500/50 py-2 w-full text-center bg-yellow-900/40">
                      4 LANES AHEAD
                  </div>
                  <div className="text-8xl font-black text-white drop-shadow-[0_0_20px_rgba(234,179,8,0.8)] font-mono">
                      {warningState.count}
                  </div>
              </div>
          </div>
      )}

      {warpMessage && (
          <div className="absolute inset-0 z-[65] flex items-center justify-center pointer-events-none">
              <div className="bg-fuchsia-900/90 backdrop-blur-md px-8 py-4 rounded-2xl border-4 border-fuchsia-500 shadow-[0_0_50px_rgba(192,38,233,0.6)] animate-in zoom-in fade-in duration-200 flex flex-col items-center gap-2">
                  <Infinity className="w-12 h-12 text-white animate-spin-slow" />
                  <div className="text-3xl font-black italic tracking-tighter text-white drop-shadow-lg">
                      WARP ACTIVE
                  </div>
              </div>
          </div>
      )}

      {lifeAnnouncement && (
         <div className="absolute top-[25%] left-0 right-0 z-50 flex justify-center pointer-events-none">
             <div className="bg-slate-900/90 backdrop-blur-md px-5 py-3 rounded-xl border-2 border-pink-500/50 shadow-[0_0_25px_rgba(236,72,153,0.4)] animate-in zoom-in fade-in slide-in-from-top-4 duration-150 flex flex-col items-center gap-1">
                 <Heart className="w-8 h-8 text-pink-500 fill-pink-500 animate-pulse drop-shadow-lg" />
                 <div className="text-xl font-black italic tracking-tighter text-white">
                     +1 EXTRA LIFE
                 </div>
             </div>
         </div>
      )}

      {isMenuPaused && (
          <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md">
              <div className="w-full max-w-xs bg-slate-900/90 border border-slate-700 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                  <h2 className="text-3xl font-black italic text-center text-white mb-8 tracking-widest uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                      PAUSED
                  </h2>
                  <div className="flex flex-col gap-4">
                      <button 
                        onClick={togglePause}
                        className="flex items-center justify-center gap-3 w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold text-xl rounded-xl transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] active:scale-95"
                      >
                          <Play className="w-6 h-6 fill-current" />
                          RESUME
                      </button>
                      <button 
                        onClick={onRestart}
                        className="flex items-center justify-center gap-3 w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg rounded-xl transition-all active:scale-95"
                      >
                          <RotateCcw className="w-5 h-5" />
                          RESTART
                      </button>
                      <button 
                        onClick={onQuit}
                        className="flex items-center justify-center gap-3 w-full py-3 bg-transparent border border-red-500/50 hover:bg-red-950/30 text-red-400 font-bold text-lg rounded-xl transition-all active:scale-95"
                      >
                          <Home className="w-5 h-5" />
                          QUIT TO MENU
                      </button>
                  </div>
              </div>
          </div>
      )}

      {!isMenuPaused && !warningState.visible && !isSettingsOpen && !activeTutorial && (
        <>
            <button
                onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
                className="absolute z-[60] p-2.5 rounded-full bg-slate-900/80 border-2 border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-white backdrop-blur-md transition-all active:scale-95 shadow-lg"
                style={{
                    bottom: 'calc(2rem + env(safe-area-inset-bottom))',
                    left: 'calc(2rem + env(safe-area-inset-left))'
                }}
                aria-label="Settings"
            >
                <Settings className="w-6 h-6" />
            </button>

            <button
                onClick={(e) => { e.stopPropagation(); togglePause(); }}
                className="absolute z-[60] p-2.5 rounded-full bg-slate-900/80 border-2 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20 backdrop-blur-md transition-all active:scale-95 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]"
                style={{
                    bottom: 'calc(2rem + env(safe-area-inset-bottom))',
                    right: 'calc(2rem + env(safe-area-inset-right))'
                }}
                aria-label="Pause Game"
            >
                <Pause className="w-6 h-6 fill-current" />
            </button>
        </>
      )}

      <div 
        className="absolute top-0 left-0 right-0 z-40 flex flex-col gap-3 pointer-events-none"
        style={{
            padding: '0.75rem',
            paddingTop: 'calc(0.75rem + env(safe-area-inset-top))',
            paddingLeft: 'calc(0.75rem + env(safe-area-inset-left))',
            paddingRight: 'calc(0.75rem + env(safe-area-inset-right))',
        }}
      >
        
        <div className="flex justify-between items-start px-2">
            
            <div className="flex items-start gap-4">
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 font-mono leading-none">SCORE</span>
                    <span className="text-2xl font-bold font-mono text-cyan-400 leading-none">{score.toString().padStart(3, '0')}</span>
                </div>
                
                <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 font-mono leading-none">LEVEL</span>
                    <div className="flex items-center gap-1">
                        <span className="text-xl font-bold font-mono text-white leading-none">{currentLevel}</span>
                    </div>
                </div>
            </div>

            {practiceConfig?.isActive && (
                <div className="absolute left-1/2 -translate-x-1/2 top-10">
                    <div className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold uppercase tracking-widest rounded-full border border-yellow-500/50 backdrop-blur-sm animate-pulse">
                        Practice Mode
                    </div>
                </div>
            )}

            <div className="flex flex-col items-center absolute left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700 backdrop-blur-sm">
                    <Heart className={clsx("w-4 h-4", playerLives > 0 ? "text-pink-500 fill-pink-500" : "text-slate-600")} />
                    <span className={clsx("font-mono font-bold text-lg leading-none", playerLives > 0 ? "text-white" : "text-slate-500")}>
                        {playerLives}
                    </span>
                </div>
            </div>

            <div className="flex flex-col text-right">
                <span className="text-[10px] text-slate-500 font-mono leading-none">BEST</span>
                <span className="text-xl font-bold font-mono text-slate-600 leading-none">{highScore.toString().padStart(3, '0')}</span>
            </div>
        </div>

        <div className={clsx(
            "backdrop-blur-md rounded-xl p-1.5 transition-colors duration-300 mx-auto relative overflow-visible border-2 origin-top w-fit",
            !rulePulse && "scale-[0.8]",
            rulePulse 
                ? "bg-red-600 border-red-400 shadow-[0_0_50px_rgba(220,38,38,0.8)] animate-[powerup-pop_0.3s_ease-out]" 
                : isWarpReverse 
                    ? "bg-slate-900/90 border-fuchsia-500 shadow-[0_0_30px_rgba(192,38,233,0.5)]"
                : isColorRule 
                    ? "bg-slate-900/90 border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.5)]"
                    : "bg-slate-900/90 border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.5)]"
        )}>
           
           {rulePulse && (
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full rounded-xl border-white border-4 opacity-0 z-0 pointer-events-none animate-[shockwave-ring_0.3s_ease-out]" />
           )}
           
           <div className="flex flex-col gap-1 w-full">
               <div className={clsx(
                   "flex flex-row items-center justify-center gap-2 px-3 rounded-lg border-2 shadow-lg transition-all duration-200 h-12 relative z-10", 
                   "bg-white border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]",
                   rulePulse ? "scale-105" : "scale-100"
               )}>
                   {!isWarpReverse && (
                       <span className="font-mono font-black uppercase tracking-wider leading-none text-black text-3xl">
                           {isColorRule ? 'COLOR' : 'WORD'}
                       </span>
                   )}

                   <span 
                     className={clsx(
                         "font-black uppercase leading-none tracking-wide text-3xl",
                     )}
                     style={{
                         color: isWarpReverse ? '#000000' : getHudTargetColor(displayRule.targetColor),
                     }}
                   >
                       {isWarpReverse ? '?????' : hudText}
                   </span>
               </div>
               
               <div className="flex justify-center gap-1 px-1">
                   {Array.from({ length: Math.max(ruleTotal, 5) }).map((_, i) => {
                       const isLit = i < ruleProgress;
                       
                       return (
                           <div 
                                key={i}
                                className={clsx(
                                    "w-2 h-2 rounded-full border transition-all duration-300 shadow-sm relative",
                                    isLit 
                                        ? clsx(
                                            "scale-110",
                                            isColorRule 
                                                ? "bg-cyan-400 border-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                                                : "bg-orange-400 border-orange-200 shadow-[0_0_8px_rgba(249,115,22,0.8)]"
                                        )
                                        : "bg-slate-900/40 border-slate-600/40"
                                )}
                           >
                               {isLit && (
                                   <div className={clsx(
                                       "absolute inset-0 rounded-full border",
                                       isColorRule 
                                           ? "border-cyan-300 animate-[dot-ripple_0.4s_ease-out_forwards]" 
                                           : "border-orange-300 animate-[dot-ripple-orange_0.4s_ease-out_forwards]"
                                   )} />
                               )}
                           </div>
                       );
                   })}
               </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
