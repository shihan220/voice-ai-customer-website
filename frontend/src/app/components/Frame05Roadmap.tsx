const pricingPlans = [
  {
    name: 'Starter',
    eyebrow: 'Basic launch',
    tone: '#E3BB97',
    buttonLabel: 'Start Basic',
    description: 'A clean starting point for teams that want to test Bangladeshi Bangla voice with minimal lift.',
    features: [
      'Basic Bangla AI voice sample',
      '1 voice style',
      'Basic customer response script',
      'Email support',
      'Good for small testing',
    ],
  },
  {
    name: 'Gold',
    eyebrow: 'Growth tier',
    tone: '#DF9E64',
    buttonLabel: 'Choose Gold',
    description: 'A stronger commercial package for businesses that need more range, support, and tailored scripting.',
    features: [
      'Multiple Bangla AI voice samples',
      '3 voice styles',
      'Custom business script',
      'Audio delivery support',
      'Priority email support',
      'Good for growing businesses',
    ],
  },
  {
    name: 'Platinum',
    eyebrow: 'Premium scale',
    tone: '#AE6C4A',
    buttonLabel: 'Go Platinum',
    description: 'A premium offer for agencies and larger companies managing richer customer conversation flows.',
    features: [
      'Premium Bangla AI voice package',
      'Multiple custom voice styles',
      'Advanced customer conversation flow',
      'Business-specific script writing',
      'Priority support',
      'Best for agencies and larger companies',
    ],
  },
] as const;

const decorativeLetters = [
  { char: 'অ', top: '14%', left: '8%', size: '54px', opacity: 0.08, rotation: '-8deg' },
  { char: 'আ', top: '22%', left: '82%', size: '42px', opacity: 0.06, rotation: '6deg' },
  { char: 'ই', top: '56%', left: '5%', size: '36px', opacity: 0.07, rotation: '-4deg' },
  { char: 'ক', top: '68%', left: '90%', size: '58px', opacity: 0.07, rotation: '10deg' },
  { char: 'র', top: '10%', left: '48%', size: '40px', opacity: 0.05, rotation: '-12deg' },
  { char: 'শ', top: '78%', left: '24%', size: '46px', opacity: 0.06, rotation: '4deg' },
  { char: 'স', top: '42%', left: '68%', size: '50px', opacity: 0.05, rotation: '-7deg' },
  { char: 'হ', top: '84%', left: '58%', size: '34px', opacity: 0.06, rotation: '9deg' },
] as const;

export function Frame05Roadmap() {
  return (
    <div className="relative w-full overflow-hidden px-6 py-20 sm:px-8 lg:px-10 lg:py-28" style={{ backgroundColor: '#E3DFD4' }}>
      <div className="pointer-events-none absolute inset-0">
        {decorativeLetters.map((letter) => (
          <span
            key={`${letter.char}-${letter.top}-${letter.left}`}
            className="absolute select-none font-semibold text-[#373A40]"
            style={{
              fontSize: letter.size,
              left: letter.left,
              opacity: letter.opacity,
              top: letter.top,
              transform: `rotate(${letter.rotation})`,
            }}
          >
            {letter.char}
          </span>
        ))}
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="mb-10 grid gap-5 lg:mb-12 lg:grid-cols-[0.76fr_1fr] lg:items-end">
          <div>
            <div
              className="mb-6 inline-block rounded-full px-4 py-1.5 text-[10px] uppercase tracking-wider lg:text-[11px]"
              style={{
                backgroundColor: '#D2CCBE',
                color: '#373A40',
                letterSpacing: '0.1em',
                fontWeight: '600',
              }}
            >
              Subscription Plans
            </div>

            <h2
              className="text-4xl lg:text-[56px]"
              style={{
                lineHeight: '1.2',
                fontWeight: '700',
                color: '#373A40',
              }}
            >
              Pricing for Bangla AI voice teams.
            </h2>
          </div>

          <p className="max-w-2xl text-lg leading-8 text-[#373A40]/75 lg:justify-self-end">
            Choose the package that matches your current stage, from early voice testing to premium customer-facing deployments.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
          {pricingPlans.map((plan, index) => (
            <div
              key={plan.name}
              className="relative flex min-w-0 flex-col overflow-hidden rounded-[26px] p-6 shadow-[0_18px_45px_rgba(55,58,64,0.08)] transition-transform hover:-translate-y-1 lg:p-8"
              style={{
                backgroundColor: '#EEEBE4',
                border: index === 1 ? '2px solid #AE6C4A' : '2px solid #D2CCBE',
              }}
            >
              <div
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ background: `linear-gradient(90deg, ${plan.tone} 0%, rgba(210,204,190,0.42) 100%)` }}
              />

              <div
                className="mb-5 inline-flex self-start rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{
                  backgroundColor: plan.tone,
                  color: index === 2 ? '#EEEBE4' : '#373A40',
                }}
              >
                {plan.eyebrow}
              </div>

              <div className="mb-4">
                <h3 className="text-[28px] font-bold text-[#373A40] lg:text-[32px]">{plan.name}</h3>
                <p className="mt-3 text-sm leading-7 text-[#373A40]/76 lg:text-[16px]">{plan.description}</p>
              </div>

              <div className="mb-6 flex-1 rounded-[22px] border border-[#D2CCBE] bg-[#F6F2EA] p-5">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <span
                        className="mt-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{
                          backgroundColor: plan.tone,
                          color: index === 2 ? '#EEEBE4' : '#373A40',
                        }}
                      >
                        +
                      </span>
                      <span className="text-sm leading-7 text-[#373A40] lg:text-[16px]">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                className="w-full rounded-full px-5 py-3 text-sm font-semibold transition hover:brightness-95"
                style={{
                  backgroundColor: index === 2 ? '#995842' : plan.tone,
                  color: index === 2 ? '#EEEBE4' : '#373A40',
                  boxShadow: '0 16px 36px rgba(174,108,74,0.18)',
                }}
              >
                {plan.buttonLabel}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
