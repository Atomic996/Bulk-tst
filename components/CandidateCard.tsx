
import React, { useState, useEffect, useRef } from 'react';
import { Candidate, VoteValue } from '../types';
import { generateRecognitionInsight } from '../services/geminiService';

interface CandidateCardProps {
  candidate: Candidate;
  onVote: (value: VoteValue) => void;
  disabled?: boolean;
}

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, onVote, disabled }) => {
  const [animationClass, setAnimationClass] = useState('card-animation-enter');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAnimationClass('card-animation-active');
    setAiInsight(null);
    setIsInsightLoading(true);
    
    const fetchInsight = async () => {
      try {
        const insight = await generateRecognitionInsight(candidate.name);
        setAiInsight(insight);
      } catch (e) {
        setAiInsight("Active contributor in the social community graph.");
      } finally {
        setIsInsightLoading(false);
      }
    };
    fetchInsight();

    return () => {
      setAnimationClass('card-animation-enter');
      setOffsetX(0);
    };
  }, [candidate.id]);

  const handleVoteAction = (value: VoteValue) => {
    if (disabled) return;
    const exitClass = value === VoteValue.KNOW ? 'card-swipe-right' : 'card-swipe-left';
    setAnimationClass(exitClass);
    setTimeout(() => onVote(value), 450);
  };

  const onStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    setTouchStart(x);
  };

  const onMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (touchStart === null || disabled) return;
    const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const delta = x - touchStart;
    setOffsetX(delta);
  };

  const onEnd = () => {
    if (disabled) return;
    if (offsetX > 120) {
      handleVoteAction(VoteValue.KNOW);
    } else if (offsetX < -120) {
      handleVoteAction(VoteValue.DONT_KNOW);
    } else {
      setOffsetX(0);
    }
    setTouchStart(null);
  };

  const profileImg = `https://unavatar.io/twitter/${candidate.handle.replace('@','')}`;

  return (
    <div 
      ref={cardRef}
      onMouseDown={onStart}
      onMouseMove={onMove}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      style={{ 
        transform: `translateX(${offsetX}px) rotate(${offsetX * 0.05}deg)`,
        transition: touchStart === null ? 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)' : 'none',
        cursor: touchStart !== null ? 'grabbing' : 'grab'
      }}
      className={`w-full max-w-lg mx-auto bg-[#0a0a0a] border border-white/10 rounded-[3.5rem] p-10 sm:p-12 shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative overflow-hidden group select-none ${animationClass}`}
    >
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${offsetX > 50 ? 'opacity-20' : 'opacity-0'}`}>
         <div className="bg-[#00f2ff] text-black px-10 py-6 rounded-full font-black text-3xl italic uppercase tracking-tighter">Recognize</div>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${offsetX < -50 ? 'opacity-20' : 'opacity-0'}`}>
         <div className="bg-white/10 text-white px-10 py-6 rounded-full font-black text-3xl italic uppercase tracking-tighter">Skip</div>
      </div>

      <div className="flex flex-col items-center text-center space-y-8 relative z-10">
        <div className="relative">
          <div className="absolute inset-0 bg-[#00f2ff] rounded-[3rem] blur-[60px] opacity-10"></div>
          <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-[3.5rem] p-1 bg-gradient-to-tr from-white/10 to-white/5">
            <img 
              src={profileImg} 
              className="w-full h-full rounded-[3.2rem] object-cover bg-black border-4 border-[#050505] relative z-10" 
              draggable="false"
              alt={candidate.name}
            />
          </div>
        </div>

        <div className="w-full bg-white/5 border border-white/5 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute top-3 left-6 flex items-center gap-2">
            <span className="text-[7px] font-black uppercase tracking-widest text-white/20">Member Insight</span>
          </div>
          <p className="text-xs font-medium italic text-white/70 leading-relaxed pt-2">
            {isInsightLoading ? (
              <span className="animate-pulse opacity-40">Connecting profile...</span>
            ) : aiInsight}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="text-4xl sm:text-5xl font-black italic uppercase tracking-tighter leading-none truncate max-w-xs">{candidate.name}</h4>
            <span className="text-[#00f2ff] font-black text-xs uppercase tracking-[0.4em] pt-2 inline-block opacity-80">
              {candidate.handle}
            </span>
          </div>
          <div className="flex items-center justify-center gap-6 py-2">
             <div className="text-center">
                <span className="block text-2xl font-black">{candidate.trustScore}</span>
                <span className="text-[8px] font-black uppercase text-white/20 tracking-widest">Recognitions</span>
             </div>
             <div className="w-px h-8 bg-white/10"></div>
             <div className="text-center">
                <span className="block text-2xl font-black">ACTIVE</span>
                <span className="text-[8px] font-black uppercase text-white/20 tracking-widest">Status</span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 w-full gap-4 pt-4">
          <button
            onClick={() => handleVoteAction(VoteValue.DONT_KNOW)}
            disabled={disabled}
            className="group/btn py-6 rounded-[1.8rem] bg-white/5 border border-white/5 hover:bg-white/10 transition-all active:scale-95"
          >
            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em]">Skip</span>
          </button>

          <button
            onClick={() => handleVoteAction(VoteValue.KNOW)}
            disabled={disabled}
            className="py-6 rounded-[1.8rem] bg-[#00f2ff] text-black font-black hover:bg-white transition-all active:scale-95 shadow-xl"
          >
            <span className="text-[10px] uppercase tracking-[0.4em]">Recognize</span>
          </button>
        </div>
      </div>
      
      <div className="absolute -bottom-20 -right-20 text-[15rem] font-black italic opacity-[0.01] pointer-events-none">MAP</div>
    </div>
  );
};

export default CandidateCard;
