import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

const faqs = [
  {
    question: 'What makes this voice sound Bangladeshi instead of generic Bengali TTS?',
    answer:
      'The system is tuned for Bangladeshi Bangla delivery, pronunciation rhythm, and local listening expectations. The goal is natural commercial voice output, not textbook Bengali synthesis.',
  },
  {
    question: 'Can it handle Banglish, mixed scripts, and brand names?',
    answer:
      'Yes. It is designed for real-world scripts that mix Bangla, English brand names, numbers, product terms, and call-center style phrasing.',
  },
  {
    question: 'What can I use it for?',
    answer:
      'Common use cases include ad creatives, UGC voiceovers, dubbing, avatar narration, support flows, sales outreach, lead qualification, and transactional voice prompts.',
  },
  {
    question: 'Can I request a custom sample before buying?',
    answer:
      'Yes. The landing page is built around a short custom sample workflow so teams can hear their own script before moving into production.',
  },
  {
    question: 'Is this suitable for B2B sales agents and customer calls?',
    answer:
      'Yes. The voice direction is meant to work in customer-facing sales and service contexts where trust, clarity, and local tone matter.',
  },
  {
    question: 'Can developers integrate it into products or AI agents?',
    answer:
      'Yes. The product direction already includes API-oriented use cases for SaaS platforms, voice automation, and AI agent workflows.',
  },
  {
    question: 'How fast can we go from script to output?',
    answer:
      'That depends on the workflow, but the intended experience is fast iteration from script input to usable Bangladeshi Bangla voice output for testing and production.',
  },
  {
    question: 'Do you support pilot projects for teams?',
    answer:
      'Yes. The site already positions short pilot engagements for teams that want to validate the voice in real sales, support, or content workflows before scaling.',
  },
];

export function Frame07FAQ() {
  return (
    <div
      className="relative w-full overflow-hidden px-6 py-20 sm:px-8 lg:px-10 lg:py-28"
      style={{ backgroundColor: '#E3DFD4' }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 grid gap-5 lg:mb-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <div>
            <div
              className="mb-6 inline-block rounded-full px-4 py-1.5 text-[10px] uppercase tracking-wider lg:text-[11px]"
              style={{
                backgroundColor: '#EEEBE4',
                color: '#AE6C4A',
                letterSpacing: '0.1em',
                fontWeight: '600',
              }}
            >
              FAQ
            </div>

            <h2
              className="mb-4 text-3xl lg:text-[48px]"
              style={{
                lineHeight: '1.2',
                fontWeight: '700',
                color: '#373A40',
              }}
            >
              Questions teams ask before they ship Bangla voice.
            </h2>
          </div>

          <p
            className="max-w-[560px] text-base lg:justify-self-end lg:text-[20px]"
            style={{
              color: '#373A40',
              opacity: '0.75',
            }}
          >
            Practical answers for creators, operators, and product teams evaluating Bangladeshi Bangla AI voice.
          </p>
        </div>

        <div
          className="overflow-hidden rounded-[28px] border shadow-[0_18px_50px_rgba(55,58,64,0.08)]"
          style={{
            backgroundColor: '#F6F2EA',
            borderColor: '#D2CCBE',
          }}
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={faq.question}
                value={`faq-${index}`}
                className="border-[#D2CCBE] px-5 sm:px-6 lg:px-8"
              >
                <AccordionTrigger className="py-5 text-base font-semibold text-[#373A40] hover:no-underline lg:py-6 lg:text-[20px]">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="max-w-4xl text-sm leading-7 text-[#373A40]/78 lg:text-[16px]">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
