import { ArrowRight, FileText, Mic, Video, Send } from 'lucide-react';
import { DecorativeBanglaLetters, type DecorativeBanglaLetter } from './DecorativeBanglaLetters';

type Frame04CreatorProps = {
  onSampleClick?: () => void;
};

const decorativeLetters: DecorativeBanglaLetter[] = [
  { char: 'আ', top: '12%', left: '6%', size: '30px', opacity: 0.05, rotation: '-6deg' },
  { char: 'ই', top: '18%', left: '88%', size: '34px', opacity: 0.05, rotation: '9deg' },
  { char: 'উ', top: '40%', left: '3%', size: '24px', opacity: 0.04, rotation: '7deg' },
  { char: 'ত', top: '33%', left: '93%', size: '30px', opacity: 0.05, rotation: '-9deg' },
  { char: 'র', top: '71%', left: '8%', size: '38px', opacity: 0.05, rotation: '8deg' },
  { char: 'স', top: '86%', left: '84%', size: '32px', opacity: 0.05, rotation: '-7deg' },
];

export function Frame04Creator({ onSampleClick }: Frame04CreatorProps) {
  const creatorOutputs = [
    'UGC sample delivery',
    'Faceless channel voiceovers',
    'Avatar dubbing workflow',
    'Agency-ready ad narration',
    'Brand content production',
  ];

  const pipeline = [
    { label: 'Script', icon: FileText },
    { label: 'Bangla Voice', icon: Mic },
    { label: 'AI Avatar/UGC', icon: Video },
    { label: 'Publish', icon: Send },
    { label: 'Client Ad', icon: null }
  ];

  return (
    <div className="w-full relative overflow-hidden px-6 py-20 sm:px-8 lg:px-10 lg:py-28" style={{ backgroundColor: '#EEEBE4' }}>
      <DecorativeBanglaLetters letters={decorativeLetters} />
      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
        <div>
          <div 
            className="inline-block px-4 py-1.5 rounded-full mb-6 uppercase tracking-wider self-start text-[10px] lg:text-[11px]"
            style={{ 
              backgroundColor: '#E3DFD4',
              color: '#AE6C4A',
              letterSpacing: '0.1em',
              fontWeight: '600'
            }}
          >
            Content Idea 03
          </div>

          <h2 
            className="mb-3 text-4xl lg:text-[56px]"
            style={{ 
              lineHeight: '1.2',
              fontWeight: '700',
              color: '#373A40'
            }}
          >
            One Script → Bangla Ad Production
          </h2>

          <p 
            className="mb-10 text-lg lg:text-[20px]"
            style={{ 
              color: '#373A40',
              opacity: '0.75',
              maxWidth: '600px'
            }}
          >
            For UGC creators, faceless channels, agencies, avatars, and dubbing.
          </p>

          <div className="mb-10 overflow-x-auto pb-4 lg:mb-12 lg:pb-0">
            <div className="flex items-center gap-3 whitespace-nowrap">
              {pipeline.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="flex items-center gap-3">
                    <div 
                      className="px-4 py-3 lg:px-5 lg:py-4 rounded-xl flex items-center gap-2 whitespace-nowrap lg:gap-3"
                      style={{ 
                        backgroundColor: i === 1 ? '#DF9E64' : '#EEEBE4',
                        border: `2px solid ${i === 1 ? '#DF9E64' : '#D2CCBE'}`,
                        color: '#373A40'
                      }}
                    >
                      {Icon && <Icon className="w-4 h-4 lg:w-5 lg:h-5" />}
                      <span style={{ fontSize: '14px', fontWeight: '600' }} className="lg:text-[15px]">
                        {step.label}
                      </span>
                    </div>
                    {i < pipeline.length - 1 && (
                      <ArrowRight className="flex-shrink-0" style={{ color: '#C39680' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-8">
            <div 
              className="uppercase tracking-wider mb-4 text-[10px] lg:text-[11px]"
              style={{ 
                fontWeight: '600',
                color: '#373A40',
                opacity: 0.6,
                letterSpacing: '0.1em'
              }}
            >
              Ideal use cases
            </div>

            <div className="flex flex-wrap gap-2 lg:gap-3 mb-8">
              {creatorOutputs.map((item, i) => (
                <div 
                  key={item}
                  className="px-4 py-2 lg:px-6 lg:py-3 rounded-full relative overflow-hidden transition-all text-sm lg:text-[15px]"
                  style={{ 
                    backgroundColor: i === 0 ? '#AE6C4A' : '#E3DFD4',
                    color: i === 0 ? '#EEEBE4' : '#373A40',
                    fontWeight: '600',
                    border: i === 0 ? 'none' : '2px solid #D2CCBE'
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div 
            className="rounded-2xl p-6 lg:p-8"
            style={{ 
              backgroundColor: '#E3BB97',
              border: '3px solid #C39680'
            }}
          >
            <p 
              className="mb-4 text-base lg:text-[18px]"
              style={{ 
                color: '#373A40',
                fontWeight: '500'
              }}
            >
              Send one product script and receive a clean Bangladeshi Bangla sample workflow for your content or campaign.
            </p>
            <button 
              type="button"
              onClick={onSampleClick}
              className="px-6 py-3 lg:px-8 lg:py-3 rounded-xl transition-all hover:scale-105"
              style={{ 
                backgroundColor: '#AE6C4A',
                color: '#EEEBE4',
                fontSize: '16px',
                fontWeight: '700'
              }}
            >
              Request Voice Samples
            </button>
          </div>
        </div>

        <div 
          className="relative min-h-[420px] overflow-hidden rounded-2xl p-8 shadow-[0_24px_80px_rgba(174,108,74,0.22)] lg:p-12"
          style={{ 
            background: `linear-gradient(180deg, ${String('#DF9E64')} 0%, ${String('#AE6C4A')} 100%)`
          }}
        >
          <div className="absolute right-[-80px] top-[-80px] h-56 w-56 rounded-full bg-[#EEEBE4]/20 blur-3xl" />
          <div className="relative z-10 flex h-full flex-col justify-center gap-5">
            {['UGC Creator', 'Faceless Channel', 'Agency', 'Avatar Studio', 'Dubbing'].map((type) => (
              <div 
                key={type}
                className="rounded-xl p-3 lg:p-4 transition-all hover:translate-x-2 text-left"
                style={{ 
                  backgroundColor: 'rgba(238, 235, 228, 0.2)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(238, 235, 228, 0.3)'
                }}
              >
                <div 
                  style={{ 
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#EEEBE4'
                  }}
                >
                  {type}
                </div>
              </div>
            ))}
          </div>
      </div>
    </div>
  </div>
  );
}
