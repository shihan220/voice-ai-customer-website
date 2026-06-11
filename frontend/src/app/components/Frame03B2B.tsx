import { Phone, ArrowRight, CheckCircle2 } from 'lucide-react';
import { DecorativeBanglaLetters, type DecorativeBanglaLetter } from './DecorativeBanglaLetters';

type Frame03B2BProps = {
  onPilotClick?: () => void;
};

const decorativeLetters: DecorativeBanglaLetter[] = [
  { char: 'অ', top: '10%', left: '7%', size: '32px', opacity: 0.05, rotation: '-8deg' },
  { char: 'ক', top: '14%', left: '90%', size: '42px', opacity: 0.06, rotation: '7deg' },
  { char: 'গ', top: '34%', left: '4%', size: '26px', opacity: 0.05, rotation: '10deg' },
  { char: 'দ', top: '44%', left: '94%', size: '30px', opacity: 0.05, rotation: '-6deg' },
  { char: 'ভ', top: '69%', left: '9%', size: '36px', opacity: 0.05, rotation: '8deg' },
  { char: 'ল', top: '82%', left: '88%', size: '28px', opacity: 0.05, rotation: '-10deg' },
];

export function Frame03B2B({ onPilotClick }: Frame03B2BProps) {
  const flow = ['Missed Lead', 'AI Callback', 'Qualify', 'Human Handoff', 'Sales Team'];
  const buyers = ['E-commerce', 'EdTech', 'Real Estate', 'Clinics', 'BPO', 'Call Centers'];

  return (
    <div className="w-full relative overflow-hidden px-6 py-20 sm:px-8 lg:px-10 lg:py-28" style={{ backgroundColor: '#CAC4B6' }}>
      <DecorativeBanglaLetters letters={decorativeLetters} tone="#6B5243" />
      <div className="absolute left-0 top-0 h-full w-1/3 bg-[#EEEBE4]/20" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div 
              className="inline-block px-4 py-1.5 rounded-full mb-6 uppercase tracking-wider self-start text-[10px] lg:text-[11px]"
              style={{ 
                backgroundColor: '#373A40',
                color: '#E3BB97',
                letterSpacing: '0.1em',
                fontWeight: '600'
              }}
            >
              Content Idea 02 · B2B Premium
            </div>

            <h2 
              className="mb-3 text-4xl lg:text-[52px]"
              style={{ 
                lineHeight: '1.2',
                fontWeight: '700',
                color: '#373A40'
              }}
            >
              Bangla AI Sales Agent
            </h2>

            <p 
              className="mb-10 text-lg lg:text-[20px]"
              style={{ 
                color: '#373A40',
                opacity: '0.8',
                maxWidth: '700px'
              }}
            >
              A natural Bangladeshi voice for lead calls, order confirmation, and support.
            </p>

            <div className="rounded-2xl bg-[#373A40] p-6 shadow-[0_28px_80px_rgba(55,58,64,0.2)] lg:p-8">
              <div className="overflow-x-auto pb-2">
                <div className="flex items-center gap-4 whitespace-nowrap">
                {flow.map((step, i) => (
                  <div key={step} className="flex items-center gap-4">
                    <div 
                      className="rounded-xl px-6 py-4 sm:flex-shrink-0"
                      style={{ 
                        backgroundColor: i === 1 ? '#AE6C4A' : '#EEEBE4',
                        color: i === 1 ? '#EEEBE4' : '#373A40',
                        minWidth: '140px',
                        border: i === 1 ? 'none' : '2px solid #D2CCBE'
                      }}
                    >
                      <div 
                        className="uppercase tracking-wider mb-1"
                        style={{ 
                          fontSize: '10px',
                          fontWeight: '600',
                          opacity: i === 1 ? 1 : 0.6
                        }}
                      >
                        Step {i + 1}
                      </div>
                      <div 
                        style={{ 
                          fontSize: '15px',
                          fontWeight: '700'
                        }}
                      >
                        {step}
                      </div>
                    </div>
                    {i < flow.length - 1 && (
                      <div className="flex-shrink-0">
                        <ArrowRight style={{ color: '#E3BB97' }} />
                      </div>
                    )}
                  </div>
                ))}
                </div>
              </div>
            </div>
            <div 
              className="rounded-2xl p-6 lg:p-8 mt-8 relative overflow-hidden"
              style={{ 
                backgroundColor: '#EEEBE4',
                border: '3px solid #D2CCBE'
              }}
            >
              <div 
                className="absolute top-0 right-0 w-64 h-64 opacity-20"
                style={{ 
                  background: `radial-gradient(circle at top right, ${String('#DF9E64')}, transparent)`
                }}
              />

              <div className="relative z-10">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-6">
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#AE6C4A' }}
                  >
                    <Phone className="w-8 h-8" style={{ color: '#EEEBE4' }} />
                  </div>

                  <div className="flex-1">
                    <div 
                      className="uppercase tracking-wider mb-2"
                      style={{ 
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#AE6C4A',
                        letterSpacing: '0.1em'
                      }}
                    >
                      Sample AI Script
                    </div>

                    <p 
                      className="mb-4 text-lg lg:text-[20px]"
                      style={{ 
                        lineHeight: '1.6',
                        color: '#373A40',
                        fontWeight: '500'
                      }}
                    >
                      আসসালামু আলাইকুম, আমি [Brand]-এর AI assistant বলছি… ৩০ সেকেন্ড কথা বলা যাবে?
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: '#AE6C4A' }} />
                        <span style={{ fontSize: '14px', color: '#373A40', opacity: 0.7 }}>
                          Natural tone · Polite context · Instant connection
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:pt-[188px]">
            <div 
            className="uppercase tracking-wider"
            style={{ 
              fontSize: '11px',
              fontWeight: '600',
              color: '#373A40',
              opacity: 0.6,
              letterSpacing: '0.1em'
            }}
          >
            Perfect For
          </div>

          <div className="flex flex-wrap gap-2 lg:gap-3 mb-6">
            {buyers.map((buyer) => (
              <div 
                key={buyer}
                className="px-4 py-2 lg:px-5 lg:py-3 rounded-full"
                style={{ 
                  backgroundColor: '#995842',
                  color: '#EEEBE4',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                {buyer}
              </div>
            ))}
          </div>

          {/* CTA */}
          <button 
            type="button"
            onClick={onPilotClick}
            className="self-start px-6 py-3 lg:px-8 lg:py-4 rounded-xl transition-all hover:scale-105"
            style={{ 
              backgroundColor: '#AE6C4A',
              color: '#EEEBE4',
              fontSize: '16px',
              fontWeight: '700',
              boxShadow: '0 8px 24px rgba(174, 108, 74, 0.3)'
            }}
          >
            Book a 7-day Bangla AI agent pilot
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
