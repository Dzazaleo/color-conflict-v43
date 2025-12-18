
import React, { useState, useEffect, useRef } from 'react';
import { RuleType } from '../types';

interface CarProps {
  lane: number;
  laneCount?: number;
  ruleType?: RuleType;
  visualFX?: boolean;
  hitTrigger?: number; // New prop to trigger hit animation
}

const Car: React.FC<CarProps> = ({ lane, laneCount = 3, ruleType = RuleType.MATCH_COLOR, visualFX = true, hitTrigger = 0 }) => {
  const [tilt, setTilt] = useState(0);
  const [lean, setLean] = useState(0); // Pilot lean state
  const prevLane = useRef(lane);
  
  // Ref for the animation container to force reflow on hits
  const animContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lane !== prevLane.current) {
        const diff = lane - prevLane.current;
        const direction = diff > 0 ? 1 : -1; // 1 = Right, -1 = Left
        
        // Board Tilt (Banking)
        // Moving Right -> Tilt Right (Clockwise, +deg)
        // Exaggerated intensity: 30 degrees
        const bankAngle = direction * 30; 
        setTilt(bankAngle);

        // Pilot Lean (Opposite direction - Counter-balance)
        // Moving Right -> Pilot leans Left (Counter-Clockwise, -deg)
        // Exaggerated intensity: 45 degrees
        const leanAngle = direction * -45; 
        setLean(leanAngle);

        // Reset tilt/lean as we settle into the lane
        // Triggering reset slightly before the movement finishes creates a nice recovery animation
        const timeout = setTimeout(() => {
            setTilt(0);
            setLean(0);
        }, 150); 

        prevLane.current = lane;
        return () => clearTimeout(timeout);
    }
  }, [lane]);

  // Trigger Hit Animation on hitTrigger change
  useEffect(() => {
    if (hitTrigger > 0 && animContainerRef.current) {
        // Force reflow to restart animation instantly
        const el = animContainerRef.current;
        el.style.animation = 'none';
        // Trigger reflow
        void el.offsetHeight; 
        // Re-apply animation
        el.style.animation = 'hit-shiver 0.2s ease-out';
    }
  }, [hitTrigger]);

  // Dynamic lane calculation
  const leftPosPercent = ((lane + 0.5) / laneCount) * 100;

  return (
    <div
      className="absolute bottom-[15%] w-24 h-24 z-20 will-change-transform"
      style={{ 
          left: `${leftPosPercent}%`,
          // Combine translation (centering) with dynamic tilt
          transform: `translateX(-50%) rotate(${tilt}deg)`,
          // Custom transition for smooth 'ease-in-out' acceleration/deceleration
          transition: 'left 300ms cubic-bezier(0.4, 0, 0.2, 1), transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <style>{`
          @keyframes hit-shiver {
            0% { transform: scale(1); filter: brightness(1); }
            50% { transform: scale(1.08) translateY(-3px); filter: brightness(1.3); }
            100% { transform: scale(1); filter: brightness(1); }
          }
      `}</style>
      
      {/* Wrapper to handle hit animation independent of transform/hover */}
      <div ref={animContainerRef} className="w-full h-full origin-center">
          <HoverboardRider ruleType={ruleType} lean={lean} visualFX={visualFX} />
      </div>
    </div>
  );
};

interface HoverboardRiderProps {
    ruleType: RuleType;
    lean?: number;
    visualFX?: boolean;
}

const HoverboardRider: React.FC<HoverboardRiderProps> = ({ ruleType, lean = 0, visualFX = true }) => {
    // Determine colors based on rule type
    // Color Mode: Cyan / Magenta
    // Word Mode: Yellow / Gold
    const isWordMode = ruleType === RuleType.MATCH_WORD;

    const accentPrimary = isWordMode ? '#facc15' : '#22d3ee'; // Yellow-400 vs Cyan-400
    const accentSecondary = isWordMode ? '#eab308' : '#f472b6'; // Yellow-500 vs Pink-400
    const shadowColor = isWordMode ? 'rgba(250,204,21,0.4)' : 'rgba(34,211,238,0.4)';

    return (
        <div className="relative w-full h-full">
            <style>{`
                @keyframes hover {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes thruster {
                    0% { opacity: 0.7; transform: scaleY(1); }
                    50% { opacity: 1; transform: scaleY(1.3); }
                    100% { opacity: 0.7; transform: scaleY(1); }
                }
            `}</style>
            
            {/* Shadow (Static on ground to show height difference) */}
            <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-16 h-4 bg-black/50 blur-md rounded-full" />

            {/* Floating Group */}
            <div className="w-full h-full origin-bottom" style={{ animation: visualFX ? 'hover 2s ease-in-out infinite' : 'none' }}>
                <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" style={{ filter: visualFX ? `drop-shadow(0 0 10px ${shadowColor})` : 'none' }}>
                    <defs>
                        <linearGradient id="board" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#334155" />
                            <stop offset="100%" stopColor="#0f172a" />
                        </linearGradient>
                        <linearGradient id="suit" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#475569" />
                            <stop offset="100%" stopColor="#1e293b" />
                        </linearGradient>
                    </defs>

                    {/* --- THRUSTERS (Attached to board, not rider) --- */}
                    <g>
                        {/* Left */}
                        <path d="M 25 85 L 35 85 L 30 110 Z" fill={accentPrimary} filter={visualFX ? "blur(2px)" : undefined} opacity="0.8" style={{ animation: visualFX ? 'thruster 0.15s infinite' : 'none' }} />
                        {/* Right */}
                        <path d="M 65 85 L 75 85 L 70 110 Z" fill={accentPrimary} filter={visualFX ? "blur(2px)" : undefined} opacity="0.8" style={{ animation: visualFX ? 'thruster 0.15s infinite' : 'none' }} />
                    </g>

                    {/* --- HOVERBOARD (Attached to global tilt) --- */}
                    <g>
                        {/* Main Body */}
                        <path d="M 15 75 L 85 75 L 90 95 L 10 95 Z" fill="url(#board)" stroke={accentPrimary} strokeWidth="2" />
                        {/* Center Detail */}
                        <path d="M 45 75 L 55 75 L 55 95 L 45 95 Z" fill={accentPrimary} opacity="0.5" />
                    </g>

                    {/* --- RIDER GROUP (Dynamic Lean) --- */}
                    {/* Pivots around the center of the board surface */}
                    <g 
                        style={{ 
                            transformOrigin: '50px 85px', 
                            transform: `rotate(${lean}deg)`,
                            transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                    >
                        {/* Left Leg */}
                        <path d="M 25 78 L 35 55 L 45 50" stroke="#0f172a" strokeWidth="8" strokeLinecap="round" fill="none" />
                        {/* Right Leg */}
                        <path d="M 75 78 L 65 55 L 55 50" stroke="#0f172a" strokeWidth="8" strokeLinecap="round" fill="none" />
                        
                        {/* Boots */}
                        <rect x="20" y="75" width="12" height="6" rx="2" fill="#64748b" />
                        <rect x="68" y="75" width="12" height="6" rx="2" fill="#64748b" />

                        {/* Torso */}
                        <path d="M 35 50 L 65 50 L 62 20 L 38 20 Z" fill="url(#suit)" stroke="#334155" strokeWidth="1" />
                        
                        {/* Tech Backpack */}
                        <rect x="42" y="25" width="16" height="20" rx="3" fill="#1e293b" />
                        <circle cx="50" cy="30" r="2" fill={accentSecondary} className="animate-pulse" /> {/* Light */}
                        <rect x="46" y="35" width="8" height="2" fill={accentPrimary} />

                        {/* Arms (Balancing) */}
                        <path d="M 38 25 L 20 40" stroke="#475569" strokeWidth="6" strokeLinecap="round" />
                        <path d="M 62 25 L 80 40" stroke="#475569" strokeWidth="6" strokeLinecap="round" />
                        {/* Gloves */}
                        <circle cx="18" cy="42" r="4" fill="#1e293b" />
                        <circle cx="82" cy="42" r="4" fill="#1e293b" />

                        {/* Helmet */}
                        <circle cx="50" cy="15" r="11" fill="#334155" stroke={accentSecondary} strokeWidth="1.5" />
                        {/* Cyber Scarf (Flowing) */}
                        <path d="M 58 18 Q 75 18 85 5" fill="none" stroke={accentPrimary} strokeWidth="3" opacity="0.9" style={{ animation: visualFX ? 'hover 1s ease-in-out infinite alternate-reverse' : 'none' }} />
                    </g>
                </svg>
            </div>
        </div>
    );
};

export default Car;