type BanglaLetter = {
  char: string;
  top: string;
  left: string;
  size: string;
  opacity: number;
  rotation: string;
  color: string;
  blur?: string;
  weight?: number;
  driftX?: string;
  driftY?: string;
  duration?: string;
  delay?: string;
};

// Art-direct the right panel by changing these values.
const banglaLetters: BanglaLetter[] = [
  { char: 'অ', top: '7%', left: '10%', size: '88px', opacity: 0.52, rotation: '-8deg', color: '#F1D9BF', weight: 700, driftX: '10px', driftY: '8px', duration: '18s', delay: '-2s' },
  { char: 'আ', top: '5%', left: '53%', size: '42px', opacity: 0.42, rotation: '11deg', color: '#E7BA8F', weight: 600, driftX: '8px', driftY: '6px', duration: '16s', delay: '-5s' },
  { char: 'ই', top: '12%', left: '76%', size: '112px', opacity: 0.22, rotation: '6deg', color: '#FFEBD7', blur: '1px', weight: 700, driftX: '12px', driftY: '10px', duration: '22s', delay: '-8s' },
  { char: 'ঈ', top: '18%', left: '31%', size: '54px', opacity: 0.48, rotation: '14deg', color: '#F6C98F', weight: 600, driftX: '9px', driftY: '7px', duration: '17s', delay: '-3s' },
  { char: 'উ', top: '23%', left: '8%', size: '38px', opacity: 0.4, rotation: '7deg', color: '#D9A06B', weight: 500, driftX: '7px', driftY: '9px', duration: '15s', delay: '-6s' },
  { char: 'ঊ', top: '26%', left: '62%', size: '72px', opacity: 0.5, rotation: '-13deg', color: '#F5D6AF', weight: 700, driftX: '11px', driftY: '8px', duration: '20s', delay: '-4s' },
  { char: 'ঋ', top: '34%', left: '43%', size: '34px', opacity: 0.36, rotation: '-3deg', color: '#FFE6C9', weight: 500, driftX: '6px', driftY: '5px', duration: '14s', delay: '-1s' },
  { char: 'এ', top: '37%', left: '83%', size: '66px', opacity: 0.38, rotation: '18deg', color: '#E8B178', weight: 700, driftX: '10px', driftY: '9px', duration: '21s', delay: '-7s' },
  { char: 'ঐ', top: '47%', left: '18%', size: '122px', opacity: 0.18, rotation: '-15deg', color: '#FBE6D2', blur: '1.5px', weight: 800, driftX: '13px', driftY: '10px', duration: '24s', delay: '-10s' },
  { char: 'ও', top: '48%', left: '60%', size: '44px', opacity: 0.45, rotation: '8deg', color: '#F2C797', weight: 600, driftX: '8px', driftY: '7px', duration: '16s', delay: '-9s' },
  { char: 'ঔ', top: '59%', left: '79%', size: '92px', opacity: 0.3, rotation: '-10deg', color: '#FFEAD5', weight: 700, driftX: '12px', driftY: '8px', duration: '22s', delay: '-12s' },
  { char: 'ক', top: '68%', left: '12%', size: '56px', opacity: 0.46, rotation: '12deg', color: '#DFA66F', weight: 700, driftX: '9px', driftY: '10px', duration: '18s', delay: '-11s' },
  { char: 'খ', top: '72%', left: '51%', size: '104px', opacity: 0.24, rotation: '6deg', color: '#F7D7B5', blur: '1px', weight: 800, driftX: '11px', driftY: '9px', duration: '23s', delay: '-14s' },
  { char: 'গ', top: '82%', left: '34%', size: '40px', opacity: 0.5, rotation: '-9deg', color: '#FFE1C5', weight: 600, driftX: '7px', driftY: '6px', duration: '15s', delay: '-13s' },
  { char: 'ঘ', top: '85%', left: '72%', size: '58px', opacity: 0.36, rotation: '17deg', color: '#C98558', weight: 700, driftX: '10px', driftY: '7px', duration: '19s', delay: '-16s' },
  { char: 'ঙ', top: '16%', left: '47%', size: '28px', opacity: 0.34, rotation: '-18deg', color: '#F9D3A7', weight: 500, driftX: '6px', driftY: '5px', duration: '13s', delay: '-4.5s' },
  { char: 'চ', top: '30%', left: '24%', size: '86px', opacity: 0.24, rotation: '10deg', color: '#FFF0DE', weight: 700, driftX: '12px', driftY: '9px', duration: '21s', delay: '-15s' },
  { char: 'ছ', top: '41%', left: '7%', size: '32px', opacity: 0.4, rotation: '-7deg', color: '#E0A36D', weight: 600, driftX: '8px', driftY: '7px', duration: '16s', delay: '-2.5s' },
  { char: 'জ', top: '42%', left: '69%', size: '50px', opacity: 0.48, rotation: '-14deg', color: '#FBD8B2', weight: 700, driftX: '10px', driftY: '8px', duration: '17s', delay: '-6.5s' },
  { char: 'ঝ', top: '65%', left: '38%', size: '30px', opacity: 0.38, rotation: '16deg', color: '#FFE6CE', weight: 500, driftX: '7px', driftY: '6px', duration: '14s', delay: '-9.5s' },
  { char: 'ঞ', top: '78%', left: '87%', size: '36px', opacity: 0.44, rotation: '-5deg', color: '#E6B27F', weight: 600, driftX: '9px', driftY: '8px', duration: '18s', delay: '-17s' },
  { char: 'ট', top: '10%', left: '29%', size: '30px', opacity: 0.3, rotation: '15deg', color: '#BD7655', weight: 600, driftX: '6px', driftY: '5px', duration: '13s', delay: '-1.5s' },
  { char: 'ঠ', top: '20%', left: '87%', size: '34px', opacity: 0.42, rotation: '-12deg', color: '#F8D9B9', weight: 500, driftX: '8px', driftY: '6px', duration: '15s', delay: '-12.5s' },
  { char: 'ড', top: '56%', left: '33%', size: '62px', opacity: 0.38, rotation: '4deg', color: '#F4BE83', weight: 700, driftX: '10px', driftY: '9px', duration: '19s', delay: '-8.5s' },
  { char: 'ঢ', top: '89%', left: '9%', size: '42px', opacity: 0.32, rotation: '-16deg', color: '#FCE4CA', weight: 600, driftX: '7px', driftY: '8px', duration: '16s', delay: '-18s' },
  { char: 'ণ', top: '88%', left: '55%', size: '28px', opacity: 0.36, rotation: '9deg', color: '#D99C69', weight: 500, driftX: '6px', driftY: '5px', duration: '14s', delay: '-7.5s' },
  { char: 'ত', top: '8%', left: '86%', size: '26px', opacity: 0.36, rotation: '10deg', color: '#F2C596', weight: 500, driftX: '6px', driftY: '5px', duration: '13s', delay: '-5.5s' },
  { char: 'থ', top: '31%', left: '51%', size: '36px', opacity: 0.32, rotation: '-15deg', color: '#FFE4CC', weight: 600, driftX: '8px', driftY: '7px', duration: '15s', delay: '-10.5s' },
  { char: 'দ', top: '61%', left: '61%', size: '74px', opacity: 0.42, rotation: '13deg', color: '#EABB86', weight: 700, driftX: '11px', driftY: '9px', duration: '20s', delay: '-11.5s' },
  { char: 'ধ', top: '74%', left: '22%', size: '26px', opacity: 0.3, rotation: '-8deg', color: '#FFECD7', weight: 500, driftX: '6px', driftY: '5px', duration: '13s', delay: '-14.5s' },
  { char: 'ন', top: '92%', left: '76%', size: '34px', opacity: 0.3, rotation: '8deg', color: '#C8865D', weight: 600, driftX: '8px', driftY: '7px', duration: '15s', delay: '-3.5s' },
  { char: 'প', top: '25%', left: '77%', size: '30px', opacity: 0.34, rotation: '-4deg', color: '#FBE1BF', weight: 500, driftX: '7px', driftY: '6px', duration: '14s', delay: '-6.8s' },
  { char: 'ফ', top: '38%', left: '25%', size: '42px', opacity: 0.34, rotation: '18deg', color: '#D79462', weight: 600, driftX: '9px', driftY: '7px', duration: '17s', delay: '-9.8s' },
  { char: 'ব', top: '53%', left: '86%', size: '30px', opacity: 0.36, rotation: '-11deg', color: '#FFE9D3', weight: 600, driftX: '7px', driftY: '6px', duration: '15s', delay: '-16.5s' },
  { char: 'ভ', top: '69%', left: '69%', size: '44px', opacity: 0.42, rotation: '9deg', color: '#F2CA9C', weight: 700, driftX: '9px', driftY: '8px', duration: '18s', delay: '-2.2s' },
  { char: 'ম', top: '81%', left: '20%', size: '66px', opacity: 0.34, rotation: '-6deg', color: '#FBE7D3', weight: 700, driftX: '11px', driftY: '9px', duration: '21s', delay: '-19s' },
  { char: 'য', top: '15%', left: '65%', size: '24px', opacity: 0.32, rotation: '13deg', color: '#DDA070', weight: 500, driftX: '6px', driftY: '5px', duration: '12s', delay: '-7.2s' },
  { char: 'র', top: '44%', left: '48%', size: '26px', opacity: 0.38, rotation: '-17deg', color: '#FFEAD8', weight: 600, driftX: '7px', driftY: '6px', duration: '14s', delay: '-5.8s' },
  { char: 'ল', top: '57%', left: '12%', size: '34px', opacity: 0.3, rotation: '7deg', color: '#C57F5B', weight: 600, driftX: '8px', driftY: '7px', duration: '16s', delay: '-13.2s' },
  { char: 'শ', top: '32%', left: '90%', size: '24px', opacity: 0.34, rotation: '16deg', color: '#F5CE9F', weight: 500, driftX: '6px', driftY: '5px', duration: '13s', delay: '-8.2s' },
  { char: 'ষ', top: '52%', left: '71%', size: '24px', opacity: 0.32, rotation: '-3deg', color: '#D79763', weight: 500, driftX: '6px', driftY: '5px', duration: '12s', delay: '-10.2s' },
  { char: 'স', top: '76%', left: '45%', size: '32px', opacity: 0.36, rotation: '11deg', color: '#FFE5CC', weight: 600, driftX: '8px', driftY: '7px', duration: '15s', delay: '-4.2s' },
  { char: 'হ', top: '91%', left: '40%', size: '24px', opacity: 0.28, rotation: '-12deg', color: '#ECC08F', weight: 500, driftX: '6px', driftY: '5px', duration: '12s', delay: '-15.2s' },
];

const ctaWaveformHeights = [
  35, 46, 58, 69, 78, 86, 92, 88, 79, 66,
  52, 41, 33, 44, 59, 72, 84, 90, 82, 68,
  49, 37, 31, 43, 57, 73, 87, 94, 85, 71,
  54, 39, 32, 45, 61, 76, 89, 91, 80, 63,
];

const heroWaveLetters = [
  { char: 'অ', top: '53%', left: '8%', size: '36px', opacity: 0.1, rotation: '-8deg' },
  { char: 'আ', top: '43%', left: '18%', size: '28px', opacity: 0.08, rotation: '7deg' },
  { char: 'ই', top: '61%', left: '29%', size: '30px', opacity: 0.075, rotation: '12deg' },
  { char: 'ঈ', top: '52%', left: '41%', size: '34px', opacity: 0.09, rotation: '-6deg' },
  { char: 'উ', top: '42%', left: '53%', size: '26px', opacity: 0.07, rotation: '10deg' },
  { char: 'ক', top: '56%', left: '64%', size: '38px', opacity: 0.095, rotation: '-10deg' },
  { char: 'খ', top: '64%', left: '75%', size: '30px', opacity: 0.08, rotation: '8deg' },
  { char: 'গ', top: '52%', left: '86%', size: '34px', opacity: 0.085, rotation: '-7deg' },
  { char: 'ঘ', top: '44%', left: '94%', size: '28px', opacity: 0.07, rotation: '11deg' },
];

type BanglaVoiceHeroProps = {
  onSampleClick?: () => void;
};

export function BanglaVoiceHero({ onSampleClick }: BanglaVoiceHeroProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#F2EFE7] text-[#33373D]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(380px,2fr)]">
        <div className="relative flex min-h-[66vh] items-center overflow-hidden px-6 py-16 sm:px-10 md:px-14 lg:min-h-screen lg:px-20 xl:px-24">
          <div className="pointer-events-none absolute left-[-140px] top-[-120px] h-80 w-80 rounded-full bg-[#E3BB97]/25 blur-3xl" />
          <div className="pointer-events-none absolute bottom-12 right-10 hidden h-24 w-24 rounded-full border border-[#D6C9B5] opacity-70 lg:block" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden" aria-hidden="true">
            <div className="hero-background-wave flex h-64 w-[200%]">
              {[0, 1].map((copyIndex) => (
                <div key={copyIndex} className="relative h-64 flex-[0_0_50%]">
                  <svg className="h-64 w-full" viewBox="0 0 900 260" preserveAspectRatio="none">
                    <path d="M0 138 C75 92 150 92 225 138 C300 184 375 184 450 138 C525 92 600 92 675 138 C750 184 825 184 900 138" stroke="#AE6C4A" strokeOpacity="0.12" strokeWidth="2" fill="none" />
                    <path d="M0 166 C75 112 150 112 225 166 C300 220 375 220 450 166 C525 112 600 112 675 166 C750 220 825 220 900 166" stroke="#DF9E64" strokeOpacity="0.12" strokeWidth="1.5" fill="none" />
                    <path d="M0 110 C75 68 150 68 225 110 C300 152 375 152 450 110 C525 68 600 68 675 110 C750 152 825 152 900 110" stroke="#C39680" strokeOpacity="0.12" strokeWidth="1.5" fill="none" />
                  </svg>
                  {heroWaveLetters.map((letter, index) => (
                    <span
                      key={`${letter.char}-${copyIndex}-${index}`}
                      className="pointer-events-none absolute select-none font-['Hind_Siliguri'] leading-none text-[#995842]"
                      style={{
                        top: letter.top,
                        left: letter.left,
                        fontSize: letter.size,
                        opacity: letter.opacity,
                        transform: `translate(-50%, -50%) rotate(${letter.rotation})`,
                      }}
                    >
                      {letter.char}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-10 left-10 grid grid-cols-3 gap-2 opacity-35" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, index) => (
              <span key={index} className="h-1.5 w-1.5 rounded-full bg-[#AE6C4A]" />
            ))}
          </div>

          <div className="relative z-10 max-w-4xl">
            <div className="mb-8 inline-flex rounded-full border border-[#D8CCB8] bg-[#E8E1D3]/80 px-4 py-2 text-[11px] font-bold uppercase text-[#995842] shadow-sm backdrop-blur">
              BANGLADESHI BANGLA AI VOICE
            </div>

            <h1 className="mb-7 max-w-[780px] text-[46px] font-bold leading-[1.08] text-[#33373D] sm:text-[58px] lg:text-[72px] xl:text-[86px]">
              বাংলা Voice That
              <br />
              Finally Sounds
              <br />
              Like
              <br />
              Bangladesh
            </h1>

            <p className="mb-10 max-w-2xl text-lg leading-8 text-[#4A4E55] sm:text-xl lg:text-[22px] lg:leading-9">
              Human Bangladeshi Bangla AI voice for creators, UGC, dubbing, avatars, and AI sales agents.
            </p>

            <div className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-full border border-[#D4B188] bg-[#E8BE92] px-5 py-3 text-sm font-bold text-[#373A40] shadow-[0_14px_35px_rgba(174,108,74,0.18)] sm:px-6 sm:text-base">
              <span>Native tone</span>
              <span className="text-[#995842]">•</span>
              <span>Banglish ready</span>
              <span className="text-[#995842]">•</span>
              <span>B2B premium</span>
            </div>

            <div 
              className="mt-8 max-w-3xl rounded-2xl p-6 lg:p-8 relative overflow-hidden shadow-[0_24px_70px_rgba(174,108,74,0.16)]"
              style={{ backgroundColor: '#E3DFD4' }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                <div className="flex items-end gap-1 lg:gap-2 h-24 lg:h-28">
                  {ctaWaveformHeights.map((height, i) => (
                    <div
                      key={i}
                      className="rounded-full w-1 lg:w-2"
                      style={{
                        backgroundColor: '#AE6C4A',
                        height: `${height}%`,
                        animation: `hero-wave ${2 + (i % 3) * 0.3}s ease-in-out infinite`,
                        animationDelay: `${i * 0.05}s`
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between text-left gap-5">
                <div>
                  <p 
                    className="mb-2 text-2xl lg:text-[28px]"
                    style={{ 
                      fontWeight: '700',
                      color: '#373A40'
                    }}
                  >
                    Start with a 30-sec custom sample.
                  </p>
                  <p 
                    className="text-sm lg:text-[16px]"
                    style={{ 
                      color: '#373A40',
                      opacity: '0.7'
                    }}
                  >
                    Experience the difference. Hear real Bangladeshi Bangla.
                  </p>
                </div>

                <button 
                  type="button"
                  onClick={onSampleClick}
                  className="px-8 py-4 lg:px-10 lg:py-4 rounded-xl transition-all hover:scale-105 flex-shrink-0"
                  style={{ 
                    backgroundColor: '#AE6C4A',
                    color: '#EEEBE4',
                    fontSize: '18px',
                    fontWeight: '700',
                    boxShadow: '0 12px 32px rgba(174, 108, 74, 0.4)'
                  }}
                >
                  Get Your Sample
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="relative min-h-[320px] overflow-hidden bg-[linear-gradient(150deg,#B87553_0%,#995842_48%,#6F3E31_100%)] lg:min-h-screen">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,237,212,0.22),transparent_28%),radial-gradient(circle_at_80%_78%,rgba(74,35,28,0.32),transparent_34%)]" />
          <div className="absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-black/20 to-transparent lg:block" />
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/10 to-transparent" />
          <div className="absolute bottom-8 left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#F4D8BA]/45 to-transparent" />

          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            {banglaLetters.map((letter, index) => (
              <span
                key={`${letter.char}-${index}`}
                className="pointer-events-none absolute select-none"
                style={{
                  top: letter.top,
                  left: letter.left,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <span
                  className="hero-right-letter inline-block font-['Hind_Siliguri'] leading-none"
                  style={{
                    fontSize: letter.size,
                    opacity: letter.opacity,
                    color: letter.color,
                    fontWeight: letter.weight ?? 600,
                    filter: letter.blur ? `blur(${letter.blur})` : undefined,
                    textShadow: '0 16px 38px rgba(45, 19, 14, 0.28)',
                    transform: `rotate(${letter.rotation})`,
                    animationDuration: letter.duration ?? '18s',
                    animationDelay: letter.delay ?? '0s',
                    ['--hero-letter-drift-x' as string]: letter.driftX ?? '8px',
                    ['--hero-letter-drift-y' as string]: letter.driftY ?? '6px',
                    ['--hero-letter-rotate' as string]: letter.rotation,
                  }}
                >
                  {letter.char}
                </span>
              </span>
            ))}
          </div>

          <div className="absolute inset-6 rounded-[28px] border border-[#F2D7BA]/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]" />
        </div>
      </div>
      <style>{`
        @keyframes hero-background-wave-travel {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }

        @keyframes hero-wave {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.3); }
        }

        .hero-background-wave {
          animation: hero-background-wave-travel 18s linear infinite;
          will-change: transform;
        }

        @keyframes hero-right-letter-drift {
          0%, 100% {
            transform: translate3d(calc(var(--hero-letter-drift-x) * -0.45), calc(var(--hero-letter-drift-y) * -0.35), 0) rotate(var(--hero-letter-rotate));
          }
          25% {
            transform: translate3d(calc(var(--hero-letter-drift-x) * 0.3), calc(var(--hero-letter-drift-y) * -0.6), 0) rotate(calc(var(--hero-letter-rotate) + 1.5deg));
          }
          50% {
            transform: translate3d(var(--hero-letter-drift-x), calc(var(--hero-letter-drift-y) * 0.45), 0) rotate(calc(var(--hero-letter-rotate) - 1deg));
          }
          75% {
            transform: translate3d(calc(var(--hero-letter-drift-x) * -0.2), var(--hero-letter-drift-y), 0) rotate(calc(var(--hero-letter-rotate) + 1deg));
          }
        }

        .hero-right-letter {
          animation: hero-right-letter-drift 18s ease-in-out infinite;
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-background-wave,
          .hero-right-letter {
            animation: none;
            will-change: auto;
          }

          [style*="hero-wave"] {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
