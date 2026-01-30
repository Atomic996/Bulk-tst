
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Candidate, VoteValue } from './types';
import { MOCK_CANDIDATES, MAX_VOTES_PER_USER } from './constants';
import CandidateCard from './components/CandidateCard';
import { parseTwitterLinkWithGemini, generateSocialFingerprint } from './services/geminiService';
import { databaseService } from './services/supabaseService';
import html2canvas from 'html2canvas';

const STORAGE_KEYS = {
  VOTES_TODAY: 'bulk_votes_v8_today',
  LOGGED_USER: 'bulk_current_user_handle',
  VOTED_IDS: 'bulk_voted_ids_list'
};

const getDeviceFingerprint = () => {
  const n = window.navigator;
  const s = window.screen;
  const str = `${n.userAgent}|${s.width}x${s.height}|${n.language}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `node-${Math.abs(hash)}`;
};

const secureSanitize = (text: string) => {
  if (typeof text !== 'string') return '';
  return text.replace(/[<>\"\'\/]/g, '').trim();
};

export const PolarStarIcon = ({ size = "24", className = "", score = 0 }: { size?: string, className?: string, score?: number }) => {
  const glowIntensity = 15 + Math.min(score * 1.5, 40);
  return (
    <svg 
      width={size} height={size} viewBox="0 0 100 100" fill="currentColor" className={`${className} neon-glow`}
      style={{ filter: `drop-shadow(0 0 ${glowIntensity}px rgba(0,242,255,0.9))` }}
    >
      <path d="M50 0 L54 42 L80 20 L58 46 L100 50 L58 54 L80 80 L54 58 L50 100 L46 58 L20 80 L42 54 L0 50 L42 46 L20 20 L46 42 Z" />
      <circle cx="50" cy="50" r="3" fill="white" />
    </svg>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<'LANDING' | 'DASHBOARD' | 'RICE_VOTING' | 'LILY_INDEX' | 'LOGIN'>('LANDING');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userHandleInput, setUserHandleInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [globalCandidates, setGlobalCandidates] = useState<Candidate[]>([]);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [dailyVotes, setDailyVotes] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showPassport, setShowPassport] = useState(false);
  const [passportImageBase64, setPassportImageBase64] = useState<string | null>(null);
  const passportRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      const dbData = await databaseService.fetchGlobalCandidates();
      setGlobalCandidates(dbData.length > 0 ? dbData : MOCK_CANDIDATES);
    } catch (e) {
      setGlobalCandidates(MOCK_CANDIDATES);
    }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEYS.LOGGED_USER);
    if (savedUser) {
      setCurrentUser(secureSanitize(savedUser));
      setView('DASHBOARD');
    }
    const votesStr = localStorage.getItem(STORAGE_KEYS.VOTES_TODAY);
    setDailyVotes(votesStr ? Math.min(parseInt(votesStr, 10) || 0, MAX_VOTES_PER_USER) : 0);
    
    const savedVoted = localStorage.getItem(STORAGE_KEYS.VOTED_IDS);
    if (savedVoted) setVotedIds(JSON.parse(savedVoted));
    
    loadData();
  }, [loadData]);

  const myNode = useMemo(() => 
    globalCandidates.find(c => c.handle.toLowerCase() === currentUser?.toLowerCase()), 
    [globalCandidates, currentUser]
  );

  // منطق الطابور العشوائي والمفلتر
  const votingQueue = useMemo(() => {
    const available = globalCandidates.filter(c => 
      c.handle.toLowerCase() !== currentUser?.toLowerCase() && 
      !votedIds.includes(c.id)
    );
    // Shuffle array
    return [...available].sort(() => Math.random() - 0.5);
  }, [globalCandidates, currentUser, votedIds]);

  const preparePassportImage = async (handle: string) => {
    const url = `https://unavatar.io/twitter/${handle.replace('@','')}`;
    try {
      // استخدام Proxy لتجاوز CORS أو fetch مباشرة إذا كان المدخل يدعمها
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Image prepare failed", e);
      return url; // fallback to URL
    }
  };

  const login = async () => {
    const handle = secureSanitize(userHandleInput).toLowerCase();
    if (!handle) return;
    const finalHandle = handle.startsWith('@') ? handle : '@' + handle;
    
    setIsLoggingIn(true);
    const fingerprint = getDeviceFingerprint();

    try {
      const linkedHandle = await databaseService.findByFingerprint(fingerprint);
      if (linkedHandle && linkedHandle.toLowerCase() !== finalHandle.toLowerCase()) {
        alert(`Access Denied: Device already linked to node ${linkedHandle}.`);
        setIsLoggingIn(false);
        return;
      }

      const profile = await parseTwitterLinkWithGemini(`https://x.com/${finalHandle.replace('@','')}`);
      const node: Candidate = {
        id: `node-${Date.now()}`,
        name: profile?.name || finalHandle.replace('@',''),
        handle: finalHandle,
        profileImageUrl: `https://unavatar.io/twitter/${finalHandle.replace('@','')}`,
        profileUrl: `https://x.com/${finalHandle.replace('@','')}`,
        platform: 'Twitter',
        firstSeen: new Date().toISOString(),
        sharedCount: 0,
        trustScore: 0,
        totalInteractions: 0
      };
      
      await databaseService.upsertCandidate(node, fingerprint);
      localStorage.setItem(STORAGE_KEYS.LOGGED_USER, finalHandle);
      setCurrentUser(finalHandle);
      await loadData();
      setView('DASHBOARD');
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVote = async (value: VoteValue) => {
    const target = votingQueue[currentIndex];
    if (!target || !currentUser || dailyVotes >= MAX_VOTES_PER_USER) return;
    
    if (value === VoteValue.KNOW) await databaseService.incrementTrust(target.id);
    
    // حفظ في الذاكرة لمنع الظهور مرة أخرى
    const newVotedIds = [...votedIds, target.id];
    setVotedIds(newVotedIds);
    localStorage.setItem(STORAGE_KEYS.VOTED_IDS, JSON.stringify(newVotedIds));

    const nextVotes = dailyVotes + 1;
    setDailyVotes(nextVotes);
    localStorage.setItem(STORAGE_KEYS.VOTES_TODAY, nextVotes.toString());

    if (currentIndex < votingQueue.length - 1 && nextVotes < MAX_VOTES_PER_USER) {
      // لا نحتاج لزيادة الـ Index لأن القائمة سيعاد حسابها وتصغر بمقدار واحد
      // ولكن للتبسيط مع استخدام الـ state:
      // setCurrentIndex(0); // دائماً خذ العنصر الأول من القائمة المتبقية
    } else {
      await loadData();
      setView('DASHBOARD');
    }
  };

  const runAnalysis = async () => {
    if (!currentUser) return;
    setIsAnalyzing(true);
    try {
      const img = await preparePassportImage(currentUser);
      setPassportImageBase64(img);
      const result = await generateSocialFingerprint(currentUser, dailyVotes);
      setAnalysis(result);
      setShowPassport(true);
    } catch (e) {
      setAnalysis("Identity node synchronized.");
      setShowPassport(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const lilyTiers = useMemo(() => {
    const filtered = globalCandidates.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.handle.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const sorted = [...filtered].sort((a, b) => b.trustScore - a.trustScore);
    return {
      diamond: sorted.slice(0, 3),
      gold: sorted.slice(3, 10),
      silver: sorted.slice(10, 100)
    };
  }, [globalCandidates, searchQuery]);

  const shareOnX = () => {
    const text = encodeURIComponent(`Verified my Digital Identity on Bulk Protocol. Trust Index: ${myNode?.trustScore || 0}. 🌐 #BulkProtocol #SocialGraph`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white page-fade-in">
      {view !== 'LANDING' && view !== 'LOGIN' && (
        <nav className="fixed top-0 w-full z-[100] px-6 py-8 flex justify-between items-center bg-black/50 backdrop-blur-xl border-b border-white/5">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('DASHBOARD')}>
            <PolarStarIcon size="28" className="text-[#00f2ff]" score={myNode?.trustScore} />
            <span className="font-black italic text-xl uppercase tracking-tighter">Bulk.</span>
          </div>
          <div className="flex gap-8">
            <button onClick={() => setView('LILY_INDEX')} className={`text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'LILY_INDEX' ? 'text-[#00f2ff]' : 'text-white/40 hover:text-white'}`}>Classification</button>
            <button onClick={() => setView('RICE_VOTING')} className={`text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'RICE_VOTING' ? 'text-[#00f2ff]' : 'text-white/40 hover:text-white'}`}>Recognition</button>
          </div>
        </nav>
      )}

      <main className="max-w-7xl mx-auto px-6 pt-32 pb-20">
        {view === 'LANDING' && (
          <div className="h-[70vh] flex flex-col items-center justify-center text-center space-y-12">
            <div className="animate-pulse-star"><PolarStarIcon size="120" className="text-[#00f2ff]" /></div>
            <h1 className="text-7xl md:text-9xl font-black italic tracking-tighter leading-none">SOCIAL<br/><span className="text-[#00f2ff]">GRAPH.</span></h1>
            <button onClick={() => setView('LOGIN')} className="px-12 py-6 bg-white text-black font-black uppercase tracking-[0.4em] text-[10px] hover:bg-[#00f2ff] transition-all hover:scale-105 active:scale-95">Establish Node</button>
          </div>
        )}

        {view === 'LOGIN' && (
          <div className="max-w-md mx-auto mt-20 p-10 bg-[#0a0a0a] border border-white/10 rounded-[3rem] space-y-8 shadow-2xl">
             <div className="text-center space-y-2">
                <h3 className="text-3xl font-black italic uppercase tracking-tighter">Identity Binding</h3>
                <p className="text-[9px] text-white/30 uppercase tracking-[0.4em]">One device, one node protocol</p>
             </div>
             <div className="space-y-4">
                <input 
                  type="text" placeholder="@handle" value={userHandleInput}
                  onChange={(e) => setUserHandleInput(secureSanitize(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 text-xl font-bold focus:border-[#00f2ff] outline-none transition-all"
                />
                <button onClick={login} disabled={isLoggingIn} className="w-full py-6 bg-[#00f2ff] text-black font-black uppercase tracking-[0.3em] rounded-2xl hover:bg-white transition-all active:scale-95">
                  {isLoggingIn ? 'Verifying...' : 'Link Identity'}
                </button>
             </div>
          </div>
        )}

        {view === 'DASHBOARD' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-[#0a0a0a] border border-white/10 rounded-[3.5rem] p-12 min-h-[500px] flex flex-col justify-between relative overflow-hidden group shadow-2xl">
               <div className="absolute -right-20 -top-20 opacity-[0.03] rotate-12 group-hover:scale-110 transition-transform duration-1000"><PolarStarIcon size="500" /></div>
               <div className="relative z-10 space-y-10">
                  <div className="flex items-center gap-6">
                    <img src={`https://unavatar.io/twitter/${currentUser?.replace('@','')}`} className="w-24 h-24 rounded-3xl border-2 border-[#00f2ff]/20 shadow-2xl" alt="" />
                    <div className="space-y-1">
                        <h2 className="text-5xl font-black italic uppercase tracking-tighter">{myNode?.name || currentUser}</h2>
                        <span className="text-[#00f2ff] font-black uppercase tracking-[0.4em] text-[9px] opacity-60">Verified Network Participant</span>
                    </div>
                  </div>
                  <div className="p-8 bg-white/5 border border-white/5 rounded-3xl backdrop-blur-xl">
                     <p className="text-sm font-medium italic text-white/80">{analysis || "Protocol synced. Analyze your node to generate a social passport."}</p>
                  </div>
               </div>
               <div className="flex gap-4 relative z-10">
                  <button onClick={() => setView('RICE_VOTING')} className="px-10 py-5 bg-[#00f2ff] text-black font-black uppercase tracking-[0.3em] text-[10px] rounded-xl hover:bg-white transition-all active:scale-95">Rice Voting</button>
                  <button onClick={runAnalysis} className="px-10 py-5 bg-white/5 text-white font-black uppercase tracking-[0.3em] text-[10px] rounded-xl border border-white/10 hover:bg-white/10 transition-all active:scale-95">
                    {isAnalyzing ? 'Mapping...' : 'Digital Passport'}
                  </button>
               </div>
            </div>
            <div className="bg-[#00f2ff] text-black rounded-[3rem] p-10 flex flex-col justify-between min-h-[250px] shadow-2xl transition-transform hover:scale-[1.02]">
               <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Identity Weight</span>
               <h4 className="text-8xl font-black italic tracking-tighter">{myNode?.trustScore || 0}</h4>
            </div>
          </div>
        )}

        {view === 'LILY_INDEX' && (
          <div className="space-y-16">
            <div className="flex flex-col md:flex-row justify-between items-end gap-8 border-b border-white/10 pb-12">
               <h3 className="text-8xl font-black italic uppercase tracking-tighter">Lily Index</h3>
               <input 
                 type="text" placeholder="FILTER NODES..." value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full md:w-[350px] bg-white/5 border border-white/10 rounded-full py-5 px-10 text-[10px] font-black outline-none focus:border-[#00f2ff] transition-all"
               />
            </div>
            
            <section className="space-y-8">
               <span className="text-[9px] font-black uppercase tracking-[0.6em] text-[#00f2ff]">Diamond Tier</span>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {lilyTiers.diamond.map(c => (
                    <div key={c.id} className="bg-[#0a0a0a] border border-[#00f2ff]/30 p-10 rounded-[3rem] hover:border-[#00f2ff] transition-all hover:scale-[1.03] shadow-xl">
                       <img src={`https://unavatar.io/twitter/${c.handle.replace('@','')}`} className="w-16 h-16 rounded-2xl mb-6 shadow-xl" alt="" />
                       <h4 className="text-xl font-black italic uppercase truncate">{c.name}</h4>
                       <p className="text-[#00f2ff] text-[8px] font-black uppercase mb-4 opacity-60">{c.handle}</p>
                       <div className="text-4xl font-black italic">{c.trustScore}</div>
                    </div>
                  ))}
               </div>
            </section>

            <section className="space-y-8">
               <span className="text-[9px] font-black uppercase tracking-[0.6em] text-white/20">Gold Tier</span>
               <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                  {lilyTiers.gold.map(c => (
                    <div key={c.id} className="bg-[#0a0a0a] border border-white/5 p-6 rounded-2xl flex items-center gap-4 hover:border-white/20 transition-all">
                       <img src={`https://unavatar.io/twitter/${c.handle.replace('@','')}`} className="w-10 h-10 rounded-xl" alt="" />
                       <div className="overflow-hidden">
                          <p className="font-black italic uppercase truncate text-[10px]">{c.name}</p>
                          <div className="text-lg font-black italic opacity-50">{c.trustScore}</div>
                       </div>
                    </div>
                  ))}
               </div>
            </section>
          </div>
        )}

        {view === 'RICE_VOTING' && (
          <div className="max-w-2xl mx-auto py-10">
             {votingQueue[currentIndex] ? (
               <CandidateCard 
                 candidate={votingQueue[currentIndex]} 
                 onVote={handleVote} 
                 disabled={dailyVotes >= MAX_VOTES_PER_USER} 
               />
             ) : (
               <div className="text-center py-20 bg-[#0a0a0a] rounded-[4rem] border border-white/10 shadow-2xl">
                  <h3 className="text-4xl font-black italic mb-8">Queue Mapped</h3>
                  <p className="text-white/40 mb-10 uppercase tracking-widest text-[10px]">No more nodes in immediate range</p>
                  <button onClick={() => setView('DASHBOARD')} className="px-10 py-5 bg-white text-black font-black uppercase text-[10px] rounded-xl hover:bg-[#00f2ff] transition-all">Return Home</button>
               </div>
             )}
          </div>
        )}
      </main>

      {showPassport && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 page-fade-in">
           <div className="max-w-xl w-full space-y-6">
              {/* تصميم الباسبور الجديد */}
              <div 
                ref={passportRef} 
                className="relative aspect-[1.58/1] bg-[#0d0d0d] border border-white/10 rounded-[2.5rem] p-10 flex flex-col justify-between overflow-hidden passport-texture shadow-[0_0_80px_rgba(0,242,255,0.1)] group"
              >
                 {/* خلفية فنية */}
                 <div className="absolute top-0 right-0 w-64 h-64 bg-[#00f2ff]/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
                 <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2"></div>
                 
                 {/* الرأس */}
                 <div className="flex justify-between items-start relative z-10">
                    <div className="flex items-center gap-3">
                       <PolarStarIcon size="32" className="text-[#00f2ff]" score={myNode?.trustScore} />
                       <div className="leading-none">
                          <span className="font-black italic uppercase tracking-tighter text-xl block">Digital Node</span>
                          <span className="text-[7px] font-black text-white/30 uppercase tracking-[0.5em]">Identity Auth v1.0</span>
                       </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-full px-4 py-2 flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-[#00f2ff] animate-pulse"></div>
                       <span className="text-[8px] font-black uppercase tracking-widest">Active Status</span>
                    </div>
                 </div>

                 {/* المحتوى الرئيسي */}
                 <div className="flex items-center gap-10 relative z-10">
                    <div className="relative group">
                       <div className="absolute inset-0 bg-[#00f2ff]/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                       <img 
                          src={passportImageBase64 || ''} 
                          className="w-36 h-36 rounded-[2.5rem] border-2 border-white/10 object-cover shadow-2xl relative z-10" 
                          crossOrigin="anonymous" 
                          alt="" 
                       />
                    </div>
                    <div className="flex-1 space-y-5">
                       <div>
                          <h4 className="text-4xl font-black italic uppercase tracking-tighter leading-none">{myNode?.name || currentUser}</h4>
                          <p className="text-[#00f2ff] font-black uppercase text-[10px] tracking-[0.3em] mt-2">{currentUser}</p>
                       </div>
                       <div className="p-4 bg-white/5 rounded-2xl border border-white/5 backdrop-blur-md">
                          <p className="text-[9px] italic text-white/60 leading-relaxed font-medium">"{analysis}"</p>
                       </div>
                    </div>
                 </div>

                 {/* التذييل */}
                 <div className="flex justify-between items-end border-t border-white/5 pt-6 relative z-10">
                    <div className="flex gap-10">
                       <div>
                          <span className="text-[7px] font-black text-white/20 uppercase tracking-widest mb-1 block">Trust Index</span>
                          <div className="text-3xl font-black italic tracking-tighter">{myNode?.trustScore || 0}</div>
                       </div>
                       <div>
                          <span className="text-[7px] font-black text-white/20 uppercase tracking-widest mb-1 block">Node Level</span>
                          <div className="text-3xl font-black italic tracking-tighter text-[#00f2ff]">ALPHA</div>
                       </div>
                    </div>
                    <div className="text-right">
                       <div className="text-[7px] font-black text-white/20 uppercase tracking-widest mb-1">Authenticated via</div>
                       <div className="font-black italic uppercase text-xs">Bulk Protocol</div>
                    </div>
                 </div>
              </div>

              {/* أزرار التحكم */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <button onClick={() => {
                   html2canvas(passportRef.current!, { 
                     backgroundColor: '#050505',
                     useCORS: true,
                     scale: 3,
                     logging: false
                   }).then(canvas => {
                     const link = document.createElement('a');
                     link.download = `bulk-passport-${currentUser}.png`;
                     link.href = canvas.toDataURL('image/png');
                     link.click();
                   });
                 }} className="py-5 bg-white text-black font-black uppercase text-[9px] rounded-2xl hover:bg-[#00f2ff] transition-all flex items-center justify-center gap-2 group">
                    <i className="fa-solid fa-download group-hover:bounce"></i> Save PNG
                 </button>
                 
                 <button onClick={shareOnX} className="py-5 bg-[#1DA1F2] text-white font-black uppercase text-[9px] rounded-2xl hover:scale-105 transition-all flex items-center justify-center gap-2">
                    <i className="fa-brands fa-x-twitter"></i> Share on X
                 </button>

                 <button onClick={() => setShowPassport(false)} className="py-5 bg-white/5 text-white font-black uppercase text-[9px] rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                    Back to Home
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
