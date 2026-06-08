import { TrendingUp, Users, DollarSign } from 'lucide-react';

export function Frame05Roadmap() {
  const roadmap = [
    {
      month: 'Month 1',
      title: 'Viral Proof Engine',
      icon: TrendingUp,
      color: '#E3BB97',
      items: [
        'Manush na AI tests',
        '30 samples',
        'Creator comments'
      ]
    },
    {
      month: 'Month 2',
      title: 'Creator Revenue Engine',
      icon: Users,
      color: '#DF9E64',
      items: [
        '20 micro-creators',
        'UGC templates',
        'Agency demos'
      ]
    },
    {
      month: 'Month 3',
      title: 'B2B Premium Engine',
      icon: DollarSign,
      color: '#AE6C4A',
      items: [
        '10 pilot calls',
        'LinkedIn proof posts',
        '3 paid pilots'
      ]
    }
  ];

  return (
    <div className="w-full relative overflow-hidden px-6 py-20 sm:px-8 lg:px-10 lg:py-28" style={{ backgroundColor: '#E3DFD4' }}>
      <div className="w-full flex flex-col justify-center max-w-7xl mx-auto">
        <div className="mb-10 grid gap-5 lg:mb-12 lg:grid-cols-[0.72fr_1fr] lg:items-end">
          <div>
            <div 
              className="inline-block px-4 py-1.5 rounded-full mb-6 uppercase tracking-wider self-start text-[10px] lg:text-[11px]"
              style={{ 
                backgroundColor: '#D2CCBE',
                color: '#373A40',
                letterSpacing: '0.1em',
                fontWeight: '600'
              }}
            >
              Strategic Timeline
            </div>

            <h2 
              className="text-4xl lg:text-[56px]"
              style={{ 
                lineHeight: '1.2',
                fontWeight: '700',
                color: '#373A40'
              }}
            >
              Launch Roadmap
            </h2>
          </div>

          <p className="max-w-2xl text-lg leading-8 text-[#373A40]/75 lg:justify-self-end">
            A simple go-to-market path that turns voice demos into creator demand and then paid business pilots.
          </p>
        </div>

        {/* Three Column Roadmap */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 flex-1">
          {roadmap.map((phase, i) => {
            const Icon = phase.icon;
            return (
              <div 
                key={phase.title}
                className="rounded-2xl p-6 lg:p-8 flex flex-col relative overflow-hidden transition-transform hover:-translate-y-2 shadow-[0_18px_45px_rgba(55,58,64,0.08)]"
                style={{ 
                  backgroundColor: '#EEEBE4',
                  border: '3px solid #D2CCBE'
                }}
              >
                {/* Progress bar at top */}
                <div 
                  className="absolute top-0 left-0 right-0 h-2"
                  style={{ 
                    background: `linear-gradient(to right, ${phase.color} 0%, ${phase.color} ${(i + 1) * 33}%, #D2CCBE ${(i + 1) * 33}%, #D2CCBE 100%)`
                  }}
                />

                {/* Month badge */}
                <div 
                  className="inline-flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 rounded-full mb-4 lg:mb-6 self-start"
                  style={{ 
                    backgroundColor: phase.color,
                    color: i === 2 ? '#EEEBE4' : '#373A40'
                  }}
                >
                  <Icon className="w-3 h-3 lg:w-4 lg:h-4" />
                  <span 
                    style={{ 
                      fontSize: '11px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}
                    className="lg:text-[12px]"
                  >
                    {phase.month}
                  </span>
                </div>

                {/* Title */}
                <h3 
                  className="mb-4 lg:mb-6 text-xl lg:text-[24px]"
                  style={{ 
                    lineHeight: '1.3',
                    fontWeight: '700',
                    color: '#373A40'
                  }}
                >
                  {phase.title}
                </h3>

                {/* Items */}
                <div className="space-y-3 lg:space-y-4 flex-1">
                  {phase.items.map((item, idx) => (
                    <div key={item} className="flex items-start gap-3">
                      <div 
                        className="w-5 h-5 lg:w-6 lg:h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 lg:mt-0 lg:text-[11px]"
                        style={{ 
                          backgroundColor: phase.color,
                          color: i === 2 ? '#EEEBE4' : '#373A40',
                          fontSize: '10px',
                          fontWeight: '700'
                        }}
                      >
                        {idx + 1}
                      </div>
                      <p 
                        className="text-sm lg:text-[16px]"
                        style={{ 
                          color: '#373A40',
                          lineHeight: '1.5'
                        }}
                      >
                        {item}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Decorative corner */}
                <div 
                  className="absolute bottom-0 right-0 w-24 h-24 opacity-10"
                  style={{
                    background: `radial-gradient(circle at bottom right, ${phase.color}, transparent)`
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Bottom Summary */}
        <div 
          className="mt-8 lg:mt-12 rounded-2xl p-6 lg:p-8 text-center"
          style={{ backgroundColor: '#995842' }}
        >
          <p 
            className="text-lg lg:text-[24px]"
            style={{ 
              fontWeight: '600',
              color: '#EEEBE4',
              lineHeight: '1.5'
            }}
          >
            Proof creates trust. <span style={{ opacity: 0.7 }}>·</span> Creators create reach. <span className="hidden lg:inline" style={{ opacity: 0.7 }}>·</span> B2B creates revenue.
          </p>
        </div>
      </div>
    </div>
  );
}
