import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { DecorativeBanglaLetters, type DecorativeBanglaLetter } from './DecorativeBanglaLetters';

type VoiceCard = {
  id: number;
  name: string;
  scriptText: string;
  englishMeaning: string | null;
  audioUrl: string | null;
  duration: number;
  waveSeed: number;
  order: number;
};

type VoiceApiResponseCard = {
  audioFile?: string | null;
  audioUrl?: string | null;
  duration?: number | string | null;
  englishMeaning?: string | null;
  english_meaning?: string | null;
  id?: number | string | null;
  isActive?: boolean | null;
  name?: string | null;
  order?: number | string | null;
  scriptText?: string | null;
  script_text?: string | null;
  waveSeed?: number | string | null;
  wave_seed?: number | string | null;
};

const fallbackVoices: VoiceCard[] = [
  {
    id: 1,
    name: 'AI Self Service Agent',
    scriptText: 'আমি আপনার এআই সেলফ-সার্ভিস এজেন্ট, কীভাবে সাহায্য করতে পারি?',
    englishMeaning: 'An AI self-service agent for handling routine customer requests.',
    audioUrl: null,
    duration: 9.72,
    waveSeed: 42,
    order: 0,
  },
  {
    id: 2,
    name: 'Business Consultant',
    scriptText: 'আমি আপনার ব্যবসার প্রয়োজন বুঝে সঠিক সমাধান সাজিয়ে দিতে পারি।',
    englishMeaning: 'A consultant voice for business guidance and solution discovery.',
    audioUrl: null,
    duration: 10.07,
    waveSeed: 43,
    order: 1,
  },
  {
    id: 3,
    name: 'Office Receptionist',
    scriptText: 'অফিস রিসেপশনে স্বাগতম, আপনার কলটি সঠিক বিভাগে যুক্ত করছি।',
    englishMeaning: 'A front-desk style voice for greeting and call routing.',
    audioUrl: null,
    duration: 8.16,
    waveSeed: 44,
    order: 2,
  },
  {
    id: 4,
    name: 'Appointment Taker',
    scriptText: 'আপনার সুবিধামতো সময় অনুযায়ী আমি অ্যাপয়েন্টমেন্ট বুক করে দিতে পারি।',
    englishMeaning: 'A scheduling voice for collecting availability and booking appointments.',
    audioUrl: null,
    duration: 9.56,
    waveSeed: 45,
    order: 3,
  },
  {
    id: 5,
    name: 'Healthcare Assistant',
    scriptText: 'স্বাস্থ্যসেবা সংক্রান্ত তথ্য, সময়সূচি ও সহায়তায় আমি আপনার পাশে আছি।',
    englishMeaning: 'A care-support voice for patient information and appointment guidance.',
    audioUrl: null,
    duration: 9.12,
    waveSeed: 46,
    order: 4,
  },
  {
    id: 6,
    name: 'Ecommerce Support',
    scriptText: 'অর্ডার, ডেলিভারি ও রিটার্ন সংক্রান্ত সহায়তা আমি এখনই দিতে পারি।',
    englishMeaning: 'A support voice for ecommerce order, delivery, and return workflows.',
    audioUrl: null,
    duration: 8.67,
    waveSeed: 47,
    order: 5,
  },
  {
    id: 7,
    name: 'Banking Fintech Support',
    scriptText: 'ব্যাংকিং ও ফিনটেক সেবার আপডেট এবং সহায়তা দ্রুত জানাতে পারি।',
    englishMeaning: 'A financial-support voice for banking and fintech service communication.',
    audioUrl: null,
    duration: 8.88,
    waveSeed: 48,
    order: 6,
  },
  {
    id: 8,
    name: 'Real Estate Lead Qualifier',
    scriptText: 'প্রপার্টি আগ্রহ, বাজেট ও লোকেশন বুঝে আমি লিড কোয়ালিফাই করি।',
    englishMeaning: 'A lead-qualification voice for real estate inquiry screening.',
    audioUrl: null,
    duration: 8.22,
    waveSeed: 49,
    order: 7,
  },
  {
    id: 9,
    name: 'Education Admission Counsellor',
    scriptText: 'ভর্তি, কোর্স ও আবেদন প্রক্রিয়া নিয়ে আমি পরিষ্কার দিকনির্দেশনা দিতে পারি।',
    englishMeaning: 'A counsellor voice for admissions, courses, and application support.',
    audioUrl: null,
    duration: 9.32,
    waveSeed: 50,
    order: 8,
  },
  {
    id: 10,
    name: 'Restaurant Hospitality Reservation',
    scriptText: 'রেস্টুরেন্ট ও হসপিটালিটি রিজার্ভেশন দ্রুত নিশ্চিত করতে আমি সাহায্য করি।',
    englishMeaning: 'A reservation voice for restaurant and hospitality booking flows.',
    audioUrl: null,
    duration: 8.79,
    waveSeed: 51,
    order: 9,
  },
];

const decorativeLetters: DecorativeBanglaLetter[] = [
  { char: 'অ', top: '10%', left: '7%', size: '32px', opacity: 0.05, rotation: '-8deg' },
  { char: 'আ', top: '14%', left: '92%', size: '40px', opacity: 0.05, rotation: '7deg' },
  { char: 'ই', top: '37%', left: '4%', size: '26px', opacity: 0.04, rotation: '11deg' },
  { char: 'ক', top: '42%', left: '95%', size: '30px', opacity: 0.05, rotation: '-7deg' },
  { char: 'র', top: '74%', left: '7%', size: '34px', opacity: 0.05, rotation: '8deg' },
  { char: 'স', top: '84%', left: '90%', size: '30px', opacity: 0.05, rotation: '-9deg' },
];

function buildWaveform(seed: number, index: number) {
  return Array.from({ length: 16 }, (_, barIndex) => {
    const value = Math.sin((seed + index * 17 + barIndex * 11) * 0.47);
    return Math.round(32 + Math.abs(value) * 60);
  });
}

function normalizeVoiceCard(voice: VoiceApiResponseCard): VoiceCard | null {
  const id = Number(voice.id);
  const duration = Number(voice.duration ?? 0);
  const order = Number(voice.order ?? 0);
  const waveSeed = Number(voice.waveSeed ?? voice.wave_seed ?? 42);
  const name = typeof voice.name === 'string' ? voice.name.trim() : '';
  const scriptTextCandidate = voice.scriptText ?? voice.script_text;
  const scriptText = typeof scriptTextCandidate === 'string' ? scriptTextCandidate.trim() : '';
  const englishMeaningCandidate = voice.englishMeaning ?? voice.english_meaning;
  const englishMeaning = typeof englishMeaningCandidate === 'string' ? englishMeaningCandidate.trim() : '';

  if (!Number.isFinite(id) || !name || !scriptText) {
    return null;
  }

  return {
    id,
    name,
    scriptText,
    englishMeaning: englishMeaning || null,
    audioUrl: typeof voice.audioUrl === 'string' && voice.audioUrl.trim() ? voice.audioUrl : null,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 2,
    waveSeed: Number.isFinite(waveSeed) ? waveSeed : 42,
    order: Number.isFinite(order) ? order : 0,
  };
}

function normalizeVoiceCards(input: unknown): VoiceCard[] {
  if (!Array.isArray(input)) return [];

  const voices = input
    .map((voice) => normalizeVoiceCard(voice as VoiceApiResponseCard))
    .filter((voice): voice is VoiceCard => Boolean(voice))
    .sort((left, right) => left.order - right.order || left.id - right.id);

  const seenIds = new Set<number>();
  return voices.filter((voice) => {
    if (seenIds.has(voice.id)) return false;
    seenIds.add(voice.id);
    return true;
  });
}

export function Frame02ViralProof() {
  const [voices, setVoices] = useState<VoiceCard[]>(fallbackVoices);
  const [voiceSource, setVoiceSource] = useState<'api' | 'fallback'>('fallback');
  const [activeVoiceId, setActiveVoiceId] = useState<number | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch('/api/voices')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Voice API returned ${response.status}`);
        }
        return response.json() as Promise<{ voices?: VoiceApiResponseCard[] }>;
      })
      .then((data) => {
        const normalizedVoices = normalizeVoiceCards(data.voices);

        if (isMounted && normalizedVoices.length) {
          setVoices(normalizedVoices);
          setVoiceSource('api');
        } else if (isMounted) {
          setVoices(fallbackVoices);
          setVoiceSource('fallback');
        }
      })
      .catch(() => {
        if (isMounted) {
          setVoices(fallbackVoices);
          setVoiceSource('fallback');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const visibleVoices = useMemo(() => voices, [voices]);
  const apiAudioReadyCount = useMemo(
    () => visibleVoices.filter((voice) => Boolean(voice.audioUrl)).length,
    [visibleVoices],
  );

  const goToSlide = useCallback((targetIndex: number, behavior: ScrollBehavior = 'smooth') => {
    if (!visibleVoices.length) return;

    const nextIndex = (targetIndex + visibleVoices.length) % visibleVoices.length;
    setCarouselIndex(nextIndex);

    window.requestAnimationFrame(() => {
      const carousel = carouselRef.current;
      const slide = carousel?.querySelectorAll<HTMLElement>('[data-voice-slide]')[nextIndex];

      if (!carousel || !slide) return;

      carousel.scrollTo({
        left: slide.offsetLeft - carousel.offsetLeft,
        behavior,
      });
    });
  }, [visibleVoices.length]);

  useEffect(() => {
    if (isCarouselPaused || visibleVoices.length <= 1) return undefined;

    const autoSlide = window.setInterval(() => {
      goToSlide(carouselIndex + 1);
    }, 3600);

    return () => window.clearInterval(autoSlide);
  }, [carouselIndex, goToSlide, isCarouselPaused, visibleVoices.length]);

  useEffect(() => {
    const syncCarouselPosition = () => goToSlide(carouselIndex, 'auto');

    window.addEventListener('resize', syncCarouselPosition);
    return () => window.removeEventListener('resize', syncCarouselPosition);
  }, [carouselIndex, goToSlide]);

  const toggleVoice = (voice: VoiceCard) => {
    if (!voice.audioUrl) return;

    if (activeVoiceId === voice.id && audioRef.current) {
      if (audioRef.current.paused) {
        const audio = audioRef.current;
        void audio.play().catch(() => {
          if (audioRef.current === audio) {
            setActiveVoiceId(null);
          }
        });
        setActiveVoiceId(voice.id);
      } else {
        audioRef.current.pause();
        setActiveVoiceId(null);
      }
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const audio = new Audio(voice.audioUrl);
    audioRef.current = audio;
    audio.onended = () => {
      if (audioRef.current === audio) {
        setActiveVoiceId(null);
      }
    };
    audio.onerror = () => {
      if (audioRef.current === audio) {
        setActiveVoiceId(null);
      }
    };
    setActiveVoiceId(voice.id);
    void audio.play().catch(() => {
      if (audioRef.current === audio) {
        setActiveVoiceId(null);
        audioRef.current = null;
      }
    });
  };

  return (
    <div className="w-full relative overflow-hidden px-6 py-20 sm:px-8 lg:px-10 lg:py-28" style={{ backgroundColor: '#EEEBE4' }}>
      <DecorativeBanglaLetters letters={decorativeLetters} />
      <div className="relative z-10 mx-auto grid max-w-7xl items-start gap-10 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="lg:sticky lg:top-24">
          <div 
            className="inline-block px-4 py-1.5 rounded-full mb-6 uppercase tracking-wider self-start text-[10px] lg:text-[11px]"
            style={{ 
              backgroundColor: '#E3DFD4',
              color: '#AE6C4A',
              letterSpacing: '0.1em',
              fontWeight: '600'
            }}
          >
            Content Idea 01
          </div>

          <h2 
            className="mb-3 text-4xl lg:text-[56px]"
            style={{ 
              lineHeight: '1.2',
              fontWeight: '700',
              color: '#373A40'
            }}
          >
            মানুষ নাকি AI?
          </h2>

          <p 
            className="mb-8 text-lg lg:text-[20px]"
            style={{ 
              color: '#373A40',
              opacity: '0.75',
              maxWidth: '600px'
            }}
          >
            Blind listening test that proves the voice quality instantly.
          </p>

          <div 
            className="relative overflow-hidden rounded-2xl p-8 shadow-[0_24px_70px_rgba(55,58,64,0.12)]"
            style={{ 
              background: `linear-gradient(135deg, ${String('#E3BB97')} 0%, ${String('#E3DFD4')} 100%)`,
              border: '1px solid #D2CCBE'
            }}
          >
            <div className="absolute right-6 top-6 h-20 w-20 rounded-full bg-[#EEEBE4]/35 blur-2xl" />
            <div className="relative z-10 flex items-center justify-between gap-6">
              <div>
                <div 
                  className="text-7xl lg:text-9xl mb-2 lg:mb-4"
                  style={{ color: '#AE6C4A', fontWeight: '800' }}
                >
                  ?
                </div>
                <p 
                  className="uppercase tracking-wider"
                  style={{ 
                    fontSize: '13px',
                    color: '#373A40',
                    fontWeight: '600',
                    letterSpacing: '0.15em'
                  }}
                >
                  Blind Test
                </p>
              </div>

              <div 
                className="text-center transform rotate-12 px-6 py-4 lg:px-8 lg:py-6 rounded-2xl border-4"
                style={{ 
                  borderColor: '#AE6C4A',
                  backgroundColor: 'transparent'
                }}
              >
                <div 
                  className="text-3xl lg:text-[42px]"
                  style={{ 
                    fontWeight: '800',
                    color: '#AE6C4A',
                    lineHeight: '1.2',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em'
                  }}
                >
                  All<br />AI
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-10 min-w-0 overflow-hidden">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{
                  backgroundColor: voiceSource === 'api' ? '#E3DFD4' : '#F6F2EA',
                  borderColor: '#D2CCBE',
                  color: voiceSource === 'api' ? '#AE6C4A' : '#373A40',
                }}
              >
                <span>{voiceSource === 'api' ? 'Live API feed' : 'Fallback samples'}</span>
                <span style={{ opacity: 0.45 }}>•</span>
                <span>{visibleVoices.length} cards</span>
                {voiceSource === 'api' ? (
                  <>
                    <span style={{ opacity: 0.45 }}>•</span>
                    <span>{apiAudioReadyCount} audio ready</span>
                  </>
                ) : null}
              </div>

              <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => goToSlide(carouselIndex - 1)}
                aria-label="Previous voice clip"
                className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:scale-105"
                style={{ backgroundColor: '#E3DFD4', color: '#373A40' }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => goToSlide(carouselIndex + 1)}
                aria-label="Next voice clip"
                className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:scale-105"
                style={{ backgroundColor: '#E3DFD4', color: '#373A40' }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              </div>
            </div>

            <div
              ref={carouselRef}
              onMouseEnter={() => setIsCarouselPaused(true)}
              onMouseLeave={() => setIsCarouselPaused(false)}
              onFocus={() => setIsCarouselPaused(true)}
              onBlur={() => setIsCarouselPaused(false)}
              className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth lg:gap-6 [&::-webkit-scrollbar]:hidden"
              style={{
                scrollbarWidth: 'none',
                overscrollBehaviorX: 'contain',
              }}
            >
              {visibleVoices.map((voice, clipIndex) => {
                const isActive = activeVoiceId === voice.id;
                const translation = voice.englishMeaning ?? 'Clean Bangla delivery for customer-facing voice workflows.';

                return (
                  <div
                    key={voice.id}
                    data-voice-slide
                    className="min-w-0 flex-[0_0_100%] snap-start md:flex-[0_0_calc((100%_-_1.5rem)_/_2)]"
                  >
                    <article
                      className="relative overflow-hidden rounded-[28px] p-5 transition-all hover:-translate-y-1 lg:p-6"
                      style={{
                        backgroundColor: '#F6F2EA',
                        border: isActive ? '2px solid #AE6C4A' : '2px solid #D2CCBE',
                        boxShadow: isActive
                          ? '0 22px 55px rgba(174, 108, 74, 0.18)'
                          : '0 16px 42px rgba(55, 58, 64, 0.08)',
                      }}
                    >
                      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#E3BB97]/25 blur-2xl" />

                      <div className="relative z-10 mb-5 flex items-start justify-between gap-4">
                        <div>
                          <p
                            className="mb-2 uppercase"
                            style={{
                              color: '#AE6C4A',
                              fontSize: '11px',
                              fontWeight: '700',
                              letterSpacing: '0.12em',
                            }}
                          >
                            Clip {String(clipIndex + 1).padStart(2, '0')}
                          </p>
                          <h3
                            className="text-xl lg:text-2xl"
                            style={{
                              color: '#373A40',
                              fontWeight: '750',
                              lineHeight: '1.2',
                            }}
                          >
                            {voice.name}
                          </h3>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleVoice(voice)}
                          disabled={!voice.audioUrl}
                          aria-label={isActive ? `Pause ${voice.name}` : `Play ${voice.name}`}
                          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full transition-all enabled:hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45 lg:h-14 lg:w-14"
                          style={{ 
                            backgroundColor: isActive ? '#AE6C4A' : '#C39680',
                            boxShadow: '0 14px 28px rgba(174, 108, 74, 0.22)',
                          }}
                        >
                          {isActive ? (
                            <Pause className="h-5 w-5" style={{ color: '#EEEBE4' }} fill="#EEEBE4" />
                          ) : (
                            <Play className="h-5 w-5 translate-x-0.5" style={{ color: '#EEEBE4' }} fill="#EEEBE4" />
                          )}
                        </button>
                      </div>

                      <div className="relative z-10 mb-5 grid gap-3">
                        <div className="rounded-2xl bg-[#EEEBE4] p-4">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#AE6C4A]">
                              Bangla script
                            </span>
                            <span className="rounded-full bg-[#E3DFD4] px-2.5 py-1 text-[11px] font-semibold text-[#373A40]/70">
                              {voice.duration}s
                            </span>
                          </div>
                          <p className="text-[20px] leading-8 text-[#373A40] lg:text-[22px]">
                            {voice.scriptText}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-[#D2CCBE] bg-white/35 p-4">
                          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#AE6C4A]">
                            English meaning
                          </span>
                          <p className="text-sm leading-6 text-[#373A40]/72 lg:text-[15px]">
                            {translation}
                          </p>
                        </div>
                      </div>

                      <div className="relative z-10 flex h-16 items-end gap-1.5 rounded-2xl bg-[#E3DFD4]/55 px-4 py-3 lg:h-20" aria-hidden="true">
                        {buildWaveform(voice.waveSeed, clipIndex).map((height, idx) => (
                          <div
                            key={idx}
                            className="flex-1 rounded-full transition-all"
                            style={{
                              backgroundColor: isActive ? '#AE6C4A' : '#DF9E64',
                              height: `${height}%`,
                              opacity: isActive ? 0.86 : 0.52
                            }}
                          />
                        ))}
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3 mb-8">
            {[
              <>Play {visibleVoices.length} clips. Ask: <span className="font-semibold">which one is AI?</span></>,
              <>Reveal: <span className="font-semibold">all generated.</span></>,
              <>CTA: Comment <span className="font-semibold">SCRIPT</span> for a free 30-sec sample.</>,
            ].map((item, index) => (
              <div key={index} className="flex items-start gap-3 rounded-2xl bg-[#E3DFD4]/70 p-5">
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                  style={{ backgroundColor: '#DF9E64', color: '#373A40', fontSize: '12px', fontWeight: '700' }}
                >
                  {index + 1}
                </div>
                <p className="text-base lg:text-[16px]" style={{ color: '#373A40' }}>
                  {item}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 lg:gap-3">
            {['Facebook', 'TikTok', 'YouTube Shorts', 'Reels'].map((platform) => (
              <div 
                key={platform}
                className="px-4 py-2 rounded-full"
                style={{ 
                  backgroundColor: '#E3DFD4',
                  color: '#373A40',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              >
                {platform}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
