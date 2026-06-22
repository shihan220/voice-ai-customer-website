import { Sparkles, Phone, Code } from 'lucide-react';
import { DecorativeBanglaLetters, type DecorativeBanglaLetter } from './DecorativeBanglaLetters';

const decorativeLetters: DecorativeBanglaLetter[] = [
  { char: 'ঈ', top: '11%', left: '5%', size: '28px', opacity: 0.05, rotation: '-8deg' },
  { char: 'এ', top: '17%', left: '91%', size: '34px', opacity: 0.05, rotation: '6deg' },
  { char: 'প', top: '42%', left: '3%', size: '26px', opacity: 0.04, rotation: '8deg' },
  { char: 'ব', top: '38%', left: '95%', size: '30px', opacity: 0.05, rotation: '-7deg' },
  { char: 'ম', top: '80%', left: '10%', size: '36px', opacity: 0.05, rotation: '10deg' },
  { char: 'হ', top: '84%', left: '88%', size: '34px', opacity: 0.05, rotation: '-9deg' },
];

export function Frame06Positioning() {
  const products = [
    {
      icon: Sparkles,
      title: 'Bangla Voice Studio',
      description:
        'A production-ready Bangladeshi Bangla voice workspace for creators, UGC teams, dubbing workflows, and avatar content.',
      points: [
        'Built for native Bangla tone and Banglish-ready delivery.',
        'Use it for short-form content, branded videos, explainer voiceovers, and creator campaigns.',
        'Works as a clean starting point for teams that need premium sample creation before full deployment.',
      ],
      color: '#E3BB97',
    },
    {
      icon: Phone,
      title: 'Bangla AI Sales Voice',
      description:
        'An AI voice workflow for sales calls, lead qualification, support handling, and business phone conversations in Bangladeshi Bangla.',
      points: [
        'Designed for inbound and outbound customer communication with a more local, human-sounding delivery.',
        'Useful for sales teams, support desks, appointment handling, follow-up calls, and corporate call flows.',
        'Supports business use cases where the voice model needs to handle real customer interaction instead of generic TTS playback.',
      ],
      color: '#DF9E64',
    },
    {
      icon: Code,
      title: 'Bangla Voice API',
      description:
        'API access for companies that want to connect Bangla Speech AI directly into their own systems, call flows, and customer-facing products.',
      points: [
        'We provide an API key so your team can integrate the voice model into your company phone number and business workflow.',
        'Use the API to generate Bangla speech for sales calls, corporate calls, AI agents, and other customer-handling call scenarios.',
        'Suitable for SaaS platforms, internal tools, enterprise products, and operational systems that need programmable voice delivery.',
      ],
      color: '#AE6C4A',
    },
  ];

  return (
    <div className="relative w-full overflow-hidden px-4 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-28" style={{ backgroundColor: '#EEEBE4' }}>
      <DecorativeBanglaLetters letters={decorativeLetters} />
      <div className="w-full flex flex-col relative z-10 justify-center max-w-7xl mx-auto">
        <div className="mb-10 grid gap-5 lg:mb-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
          <div 
            className="inline-block px-4 py-1.5 rounded-full mb-6 uppercase tracking-wider text-[10px] lg:text-[11px]"
            style={{ 
              backgroundColor: '#E3DFD4',
              color: '#AE6C4A',
              letterSpacing: '0.1em',
              fontWeight: '600'
            }}
          >
            Final Positioning
          </div>

          <h2 
            className="mb-4 text-[30px] sm:text-3xl lg:text-[48px]"
            style={{ 
              lineHeight: '1.2',
              fontWeight: '700',
              color: '#373A40'
            }}
          >
            Not Bengali TTS.<br />
            Bangladeshi Bangla Voice Infrastructure.
          </h2>
          </div>

          <p 
            className="text-sm leading-7 sm:text-base lg:text-[20px] lg:justify-self-end"
            style={{ 
              color: '#373A40',
              opacity: '0.75',
              maxWidth: '560px'
            }}
          >
            For content, commerce, customer calls, and AI agents.
          </p>
        </div>

        {/* Three Product Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-10 lg:mb-12 flex-1">
          {products.map((product, i) => {
            const Icon = product.icon;
            return (
              <div 
                key={product.title}
                className="rounded-2xl p-6 lg:p-8 flex flex-col relative overflow-hidden transition-all hover:-translate-y-1 shadow-[0_18px_45px_rgba(55,58,64,0.08)]"
                style={{ 
                  backgroundColor: '#EEEBE4',
                  border: '3px solid #D2CCBE'
                }}
              >
                {/* Icon */}
                <div 
                  className="w-12 h-12 lg:w-16 lg:h-16 rounded-full flex items-center justify-center mb-4 lg:mb-6"
                  style={{ backgroundColor: product.color }}
                >
                  <Icon 
                    className="w-6 h-6 lg:w-8 lg:h-8" 
                    style={{ color: i === 2 ? '#EEEBE4' : '#373A40' }} 
                  />
                </div>

                {/* Title */}
                <h3 
                  className="mb-2 lg:mb-3 text-xl lg:text-[22px]"
                  style={{ 
                    lineHeight: '1.3',
                    fontWeight: '700',
                    color: '#373A40'
                  }}
                >
                  {product.title}
                </h3>

                {/* Description */}
                <p
                  className="text-sm lg:text-[15px]"
                  style={{ 
                    color: '#373A40',
                    opacity: '0.7',
                    lineHeight: '1.6'
                  }}
                >
                  {product.description}
                </p>

                <div className="mt-4 space-y-3">
                  {product.points.map((point) => (
                    <div key={point} className="flex items-start gap-3">
                      <span
                        className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: product.color }}
                      />
                      <p
                        className="text-sm lg:text-[14px]"
                        style={{
                          color: '#373A40',
                          opacity: '0.74',
                          lineHeight: '1.65',
                        }}
                      >
                        {point}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Decorative accent bar */}
                <div 
                  className="absolute bottom-0 left-0 right-0 h-1"
                  style={{ backgroundColor: product.color }}
                />
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
