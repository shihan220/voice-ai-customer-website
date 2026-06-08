import { Sparkles, Phone, Code } from 'lucide-react';

export function Frame06Positioning() {
  const products = [
    {
      icon: Sparkles,
      title: 'Bangla Voice Studio',
      description: 'creators, UGC, avatars, dubbing',
      color: '#E3BB97'
    },
    {
      icon: Phone,
      title: 'Bangla AI Sales Voice',
      description: 'calls, support, lead qualification',
      color: '#DF9E64'
    },
    {
      icon: Code,
      title: 'Bangla Voice API',
      description: 'AI agents, SaaS, platforms, enterprise',
      color: '#AE6C4A'
    }
  ];

  return (
    <div className="w-full relative overflow-hidden px-6 py-20 sm:px-8 lg:px-10 lg:py-28" style={{ backgroundColor: '#EEEBE4' }}>
      <div className="w-full flex flex-col relative justify-center max-w-7xl mx-auto">
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
            className="mb-4 text-3xl lg:text-[48px]"
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
            className="text-base lg:text-[20px] lg:justify-self-end"
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
                  className="flex-1 text-sm lg:text-[15px]"
                  style={{ 
                    color: '#373A40',
                    opacity: '0.7',
                    lineHeight: '1.6'
                  }}
                >
                  {product.description}
                </p>

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
