
// ... (imports remain unchanged)
import React from 'react';
import { ObstacleRow, ColorType, ObstacleType, PowerUpType } from '../types';
import { BG_COLOR_CLASS_MAP } from '../constants';
import clsx from 'clsx';
import { Zap, Waves, CloudLightning, Shuffle, MapPin, Cone, TriangleAlert, Flame, Binary, Droplet, Tag, Infinity, Lightbulb } from 'lucide-react';

interface ObstacleProps {
  obstacle: ObstacleRow;
  activeEffect?: PowerUpType;
  wildEffects?: PowerUpType[];
  visualFX?: boolean;
  isWarpGhost?: boolean; 
  showWarpGuidance?: boolean; 
  shouldHighlightGuided?: boolean; 
  zIndex?: number; // Added Z-Index prop
}

// ... (Helpers seededRandom, getGlitchText, CRATE_STYLE_MAP, getCrateStyles, CrateVisual remain unchanged)
const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
};

const getGlitchText = (text: string, seed: number) => {
    let chars = text.split('');
    const len = chars.length;
    if (len > 3) {
        const omissionCount = seededRandom(seed) > 0.5 ? 2 : 1;
        const startRemove = Math.floor(seededRandom(seed + 1) * (len - 2)) + 1;
        chars.splice(startRemove, Math.min(omissionCount, chars.length - startRemove - 1));
    }
    const subMap: Record<string, string> = { 'A': '4', 'B': '8', 'E': '3', 'G': '6', 'I': '1', 'O': '0', 'S': '5', 'T': '7', 'Z': '2' };
    chars = chars.map((c, i) => {
        if (subMap[c]) {
            return seededRandom(seed + i + 10) < 0.6 ? subMap[c] : c;
        }
        return c;
    });
    return chars.join('');
};

const CRATE_STYLE_MAP: Record<PowerUpType, { 
    Icon: React.ElementType, 
    colorClass: string, 
    borderClass: string, 
    bgClass: string, 
    label: string, 
    pingColor: string, 
    isWild: boolean 
}> = {
    [PowerUpType.SPEED]: { Icon: Zap, colorClass: "text-yellow-400", borderClass: "border-yellow-500/50", bgClass: "bg-yellow-900/40", label: "SPEED", pingColor: "bg-yellow-500", isWild: false },
    [PowerUpType.DRUNK]: { Icon: Waves, colorClass: "text-purple-400", borderClass: "border-purple-500/50", bgClass: "bg-purple-900/40", label: "DRUNK", pingColor: "bg-purple-500", isWild: false },
    [PowerUpType.FOG]: { Icon: CloudLightning, colorClass: "text-slate-400", borderClass: "border-slate-500/50", bgClass: "bg-slate-800/60", label: "STORM", pingColor: "bg-slate-400", isWild: false },
    [PowerUpType.DYSLEXIA]: { Icon: Shuffle, colorClass: "text-orange-400", borderClass: "border-orange-500/50", bgClass: "bg-orange-900/40", label: "SWAP", pingColor: "bg-orange-500", isWild: false },
    [PowerUpType.GPS]: { Icon: MapPin, colorClass: "text-teal-400", borderClass: "border-teal-500/50", bgClass: "bg-teal-900/40", label: "GPS", pingColor: "bg-teal-500", isWild: false },
    [PowerUpType.BLOCKER]: { Icon: Cone, colorClass: "text-amber-500", borderClass: "border-amber-500/50", bgClass: "bg-amber-900/40", label: "BLOCK", pingColor: "bg-amber-500", isWild: false },
    [PowerUpType.WILD]: { Icon: Flame, colorClass: "text-white", borderClass: "border-white/80", bgClass: "bg-white/10", label: "WILD", pingColor: "bg-white", isWild: true },
    [PowerUpType.GLITCH]: { Icon: Binary, colorClass: "text-lime-400", borderClass: "border-lime-500/50", bgClass: "bg-lime-900/40", label: "GLITCH", pingColor: "bg-lime-500", isWild: false },
    [PowerUpType.BLEACH]: { Icon: Droplet, colorClass: "text-red-400", borderClass: "border-red-500/50", bgClass: "bg-red-900/40", label: "BLEACH", pingColor: "bg-red-500", isWild: false },
    [PowerUpType.ALIAS]: { Icon: Tag, colorClass: "text-indigo-400", borderClass: "border-indigo-500/50", bgClass: "bg-indigo-900/40", label: "ALIAS", pingColor: "bg-indigo-500", isWild: false },
    [PowerUpType.WARP]: { Icon: Infinity, colorClass: "text-fuchsia-400", borderClass: "border-fuchsia-500/50", bgClass: "bg-fuchsia-900/40", label: "WARP", pingColor: "bg-fuchsia-500", isWild: false },
    [PowerUpType.NONE]: { Icon: Zap, colorClass: "text-gray-400", borderClass: "border-gray-500/50", bgClass: "bg-gray-900/40", label: "NONE", pingColor: "bg-gray-500", isWild: false },
};

export const getCrateStyles = (effect: PowerUpType, visualFX: boolean = true) => {
    const base = CRATE_STYLE_MAP[effect] || CRATE_STYLE_MAP[PowerUpType.SPEED];
    let shadowClass = "shadow-sm";
    if (visualFX) {
        switch (effect) {
            case PowerUpType.SPEED: shadowClass = "shadow-[0_0_20px_rgba(234,179,8,0.4)]"; break;
            case PowerUpType.DRUNK: shadowClass = "shadow-[0_0_20px_rgba(168,85,247,0.4)]"; break;
            case PowerUpType.FOG: shadowClass = "shadow-[0_0_20px_rgba(148,163,184,0.4)]"; break;
            case PowerUpType.DYSLEXIA: shadowClass = "shadow-[0_0_20px_rgba(249,115,22,0.4)]"; break;
            case PowerUpType.GPS: shadowClass = "shadow-[0_0_20px_rgba(45,212,191,0.4)]"; break;
            case PowerUpType.BLOCKER: shadowClass = "shadow-[0_0_20px_rgba(245,158,11,0.4)]"; break;
            case PowerUpType.WILD: shadowClass = "shadow-[0_0_30px_rgba(255,255,255,0.6)]"; break;
            case PowerUpType.GLITCH: shadowClass = "shadow-[0_0_20px_rgba(132,204,22,0.4)]"; break;
            case PowerUpType.BLEACH: shadowClass = "shadow-[0_0_20px_rgba(248,113,113,0.4)]"; break;
            case PowerUpType.ALIAS: shadowClass = "shadow-[0_0_20px_rgba(129,140,248,0.4)]"; break;
            case PowerUpType.WARP: shadowClass = "shadow-[0_0_20px_rgba(192,38,233,0.4)]"; break;
            default: shadowClass = "shadow-sm";
        }
    }
    return { ...base, shadowClass };
};

export const CrateVisual: React.FC<{ effect: PowerUpType, className?: string, visualFX?: boolean }> = ({ effect, className, visualFX = true }) => {
    const { Icon, colorClass, borderClass, bgClass, shadowClass, label, pingColor, isWild } = getCrateStyles(effect, visualFX);
    return (
        <div className={clsx(
            "w-24 h-24 rounded-xl border-2 flex flex-col items-center justify-center relative",
            visualFX && "animate-pulse", 
            bgClass,
            borderClass,
            shadowClass,
            className
        )}
        style={isWild && visualFX ? { animation: 'rainbow-pulse 2s linear infinite' } : {}}
        >
             {visualFX && <div className={clsx("absolute inset-0 animate-ping rounded-xl opacity-10", pingColor)} />}
             <Icon className={clsx("w-10 h-10 mb-1", visualFX && "drop-shadow-md", colorClass)} />
             <span className={clsx("text-[10px] font-black uppercase tracking-widest", visualFX && "drop-shadow-md", colorClass)}>
                 {label}
             </span>
        </div>
    );
};

const Obstacle: React.FC<ObstacleProps> = ({ 
    obstacle, 
    activeEffect, 
    wildEffects = [], 
    visualFX = true, 
    isWarpGhost = false, 
    showWarpGuidance = false,
    shouldHighlightGuided = true,
    zIndex = 10 // Default Z-Index if not provided
}) => {
  const itemCount = obstacle.items.length;
  
  const isEffectActive = (type: PowerUpType) => {
      if (activeEffect === type) return true;
      if (activeEffect === PowerUpType.WILD && wildEffects.includes(type)) return true;
      return false;
  };

  const isGlitchActive = isEffectActive(PowerUpType.GLITCH);
  const isBleachActive = isEffectActive(PowerUpType.BLEACH);
  const isBlockerActive = isEffectActive(PowerUpType.BLOCKER);
  const isGpsActive = isEffectActive(PowerUpType.GPS);

  return (
    <div
      className="absolute w-full flex justify-between items-center px-0 pointer-events-none will-change-transform"
      style={{ 
        top: `${obstacle.y}%`,
        transform: 'translate3d(0, -50%, 0)',
        height: '110px',
        left: 0,
        zIndex: zIndex // Applying calculated zIndex here
      }}
    >
        <style>{`
            @keyframes explode {
                0% { transform: scale(1); opacity: 1; filter: brightness(1); }
                30% { transform: scale(1.1); opacity: 0.8; filter: brightness(2); }
                100% { transform: scale(1.8); opacity: 0; filter: brightness(3) blur(6px); }
            }
            @keyframes rainbow-pulse {
                0% { filter: hue-rotate(0deg) brightness(1.2); }
                100% { filter: hue-rotate(360deg) brightness(1.2); }
            }
            @keyframes warp-pulse {
                0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(192,38,233,0.3); }
                50% { transform: scale(1.05); box-shadow: 0 0 20px rgba(192,38,233,0.6); }
            }
            @keyframes guidance-pulse {
                0%, 100% { transform: scale(1.05); opacity: 0.8; box-shadow: 0 0 15px rgba(250,204,21,0.5); }
                50% { transform: scale(1.15); opacity: 1; box-shadow: 0 0 35px rgba(250,204,21,0.9); }
            }
        `}</style>
      
      {(obstacle.transitionZoneHeight || 0) > 0 && (
         <div 
           className="absolute left-0 right-0 -z-20 flex justify-center pointer-events-none"
           style={{ 
               top: '100%', 
               height: `${obstacle.transitionZoneHeight}%`
           }}
         >
            <div className="w-full h-full relative flex">
                {Array.from({ length: itemCount }).map((_, i) => (
                     <div key={i} className="h-full flex-1" />
                ))}
            </div>
         </div>
      )}

      {obstacle.items.map((item, index) => {
        if (!item) {
             return <div key={index} className="flex-1" />;
        }

        if (obstacle.type === ObstacleType.CRATE) {
             const effect = item.effect || PowerUpType.SPEED;
             const { bgClass, borderClass, shadowClass } = getCrateStyles(effect, visualFX);

             if (item.isHit) {
                 return (
                    <div key={index} className="flex-1 flex justify-center items-center relative">
                        <div className={clsx(
                            "w-24 h-24 rounded-xl flex items-center justify-center relative",
                            bgClass,
                            borderClass,
                            shadowClass
                        )} style={{ animation: 'explode 0.2s ease-out forwards' }}>
                             <div className={clsx("absolute inset-0 rounded-xl bg-white")} />
                        </div>
                    </div>
                 );
             }

             return (
                <div key={index} className="flex-1 flex justify-center items-center relative">
                    <CrateVisual effect={effect} visualFX={visualFX} />
                </div>
             );
        }

        const isLightBg = item.displayColor === ColorType.WHITE || item.displayColor === ColorType.YELLOW;
        const isBlocked = isBlockerActive && ((obstacle.id + index) % itemCount === 0);
        const displayedText = isGlitchActive ? getGlitchText(item.wordText, obstacle.id + index * 10) : item.wordText;
        const isGpsTarget = isGpsActive && item.isCorrect;
        const isGuidedTarget = shouldHighlightGuided && obstacle.isGuided && item.isCorrect;

        if (item.isHit) {
             return (
                <div key={index} className="flex-1 flex justify-center items-center relative">
                    <div 
                        className={clsx(
                            "w-24 h-24 rounded-full flex justify-center items-center shadow-lg border-4 border-white",
                            isWarpGhost ? "bg-fuchsia-500 border-fuchsia-200" : BG_COLOR_CLASS_MAP[item.displayColor],
                        )}
                        style={{ animation: 'explode 0.2s ease-out forwards' }}
                    >
                         <div className="absolute inset-0 rounded-full border-2 border-white opacity-50 scale-125"></div>
                    </div>
                </div>
             )
        }

        if (isWarpGhost) {
            const isTarget = item.isCorrect && showWarpGuidance;
            let ghostClass = "";
            let iconClass = "";
            
            if (showWarpGuidance) {
                if (isTarget) {
                    ghostClass = "border-fuchsia-300 bg-slate-900 shadow-[0_0_25px_rgba(232,121,249,0.8)] z-20 opacity-100";
                    iconClass = "text-fuchsia-200 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]";
                } else {
                    ghostClass = "border-fuchsia-900/20 bg-slate-950/50 shadow-none opacity-20 z-10";
                    iconClass = "text-fuchsia-900/20";
                }
            } else {
                ghostClass = "border-fuchsia-500/40 bg-slate-900/40 shadow-[0_0_10px_rgba(192,38,233,0.2)] z-10 opacity-75";
                iconClass = "text-fuchsia-500/50";
            }

            return (
                <div key={index} className="flex-1 flex justify-center items-center relative">
                    <div className="absolute top-1/2 w-full h-1 bg-fuchsia-900/50 -z-10" />
                    <div className={clsx(
                        "w-24 h-24 rounded-full flex justify-center items-center border-4 relative transition-all duration-300",
                        ghostClass
                    )}
                    style={{ animation: isTarget ? 'warp-pulse 1s ease-in-out infinite' : 'none' }}
                    >
                        {isTarget && (
                            <div className="absolute inset-[-6px] rounded-full border-2 border-fuchsia-500 opacity-60 animate-ping" />
                        )}
                        <div className={clsx(
                            "w-16 h-16 rounded-full border-2 border-fuchsia-400/30 flex justify-center items-center",
                            isTarget && "bg-fuchsia-500/10"
                        )}>
                             <Infinity className={clsx("w-8 h-8", iconClass)} />
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div 
                key={index} 
                className="flex-1 flex justify-center items-center relative"
            >
            <div className="absolute top-1/2 w-full h-1 bg-slate-700/50 -z-10" />
            <div 
                className={clsx(
                    "w-24 h-24 rounded-full flex justify-center items-center border-4 transition-transform relative overflow-hidden",
                    visualFX ? "shadow-lg" : "shadow-sm",
                    BG_COLOR_CLASS_MAP[item.displayColor],
                    isGuidedTarget
                        ? "border-yellow-300 ring-8 ring-yellow-500/50 z-30 animate-[guidance-pulse_1s_infinite] shadow-[0_0_40px_rgba(250,204,21,0.8)]"
                    : isGpsTarget 
                        ? "border-teal-400 ring-4 ring-teal-500/30 scale-110 z-20" 
                        : (item.displayColor === ColorType.BLACK ? "border-slate-950" : "border-slate-900")
                )}
            >
                {isGuidedTarget && (
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 animate-bounce z-40 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
                        <Lightbulb className="w-10 h-10 text-yellow-300 fill-yellow-500 stroke-[3]" />
                    </div>
                )}
                {isGpsTarget && !isGuidedTarget && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 animate-bounce z-30 drop-shadow-lg">
                        <MapPin className="w-8 h-8 text-teal-400 fill-teal-900" />
                    </div>
                )}
                {isBleachActive && (
                    <div className="absolute inset-0 bg-white opacity-[0.65] z-0 pointer-events-none" />
                )}
                <div className={clsx(
                    "w-20 h-20 rounded-full border-2 flex justify-center items-center relative z-10",
                    isLightBg ? "border-slate-900/10" : "border-white/20", 
                    isLightBg ? "bg-white/30" : "bg-black/30" 
                )}>
                    <span className={clsx(
                        "font-bold font-mono text-base font-black tracking-wider truncate px-1",
                        visualFX && "drop-shadow-md",
                        isLightBg ? "text-slate-900" : "text-white",
                        isGlitchActive && "tracking-tighter font-mono"
                    )}>
                        {displayedText}
                    </span>
                </div>
            </div>
            {isBlocked && (
                <div className="absolute inset-0 flex items-center justify-center z-20 animate-in zoom-in duration-300">
                    <div 
                        className="w-28 h-24 bg-amber-400 border-4 border-black rounded-lg flex flex-col items-center justify-center shadow-2xl transform rotate-1"
                        style={{
                            backgroundImage: 'repeating-linear-gradient(45deg, #fbbf24, #fbbf24 10px, #000 10px, #000 20px)'
                        }}
                    >
                        <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center border-2 border-amber-500 shadow-lg">
                            <TriangleAlert className="w-10 h-10 text-amber-500 animate-pulse" />
                        </div>
                    </div>
                </div>
            )}
            </div>
        );
      })}
    </div>
  );
};

export default Obstacle;
