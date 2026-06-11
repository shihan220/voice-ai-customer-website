import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { DecorativeBanglaLetters, type DecorativeBanglaLetter } from './DecorativeBanglaLetters';

const faqs = [
  {
    question: 'What makes this voice sound Bangladeshi instead of generic Bengali TTS?',
    answer:
      'The system is tuned for Bangladeshi Bangla delivery, pronunciation rhythm, and local listening expectations. The goal is natural commercial voice output, not textbook Bengali synthesis.',
    bangla:
      'বাংলা: এই সিস্টেমটি বাংলাদেশি বাংলা উচ্চারণ, বলার ছন্দ এবং স্থানীয় শ্রোতার প্রত্যাশা অনুযায়ী টিউন করা হয়েছে। লক্ষ্য হলো স্বাভাবিক বাণিজ্যিক ভয়েস আউটপুট, সাধারণ বইয়ের বাংলা টিটিএস নয়।',
  },
  {
    question: 'Can it handle Banglish, mixed scripts, and brand names?',
    answer:
      'Yes. It is designed for real-world scripts that mix Bangla, English brand names, numbers, product terms, and call-center style phrasing.',
    bangla:
      'বাংলা: হ্যাঁ। এটি এমন বাস্তব স্ক্রিপ্টের জন্য তৈরি যেখানে বাংলা, ইংরেজি ব্র্যান্ড নাম, সংখ্যা, পণ্যের শব্দ এবং কল-সেন্টার ধরনের ভাষা একসাথে থাকে।',
  },
  {
    question: 'What can I use it for?',
    answer:
      'Common use cases include ad creatives, UGC voiceovers, dubbing, avatar narration, support flows, sales outreach, lead qualification, and transactional voice prompts.',
    bangla:
      'বাংলা: এটি বিজ্ঞাপন, ইউজিসি ভয়েসওভার, ডাবিং, অ্যাভাটার ন্যারেশন, সাপোর্ট ফ্লো, সেলস আউটরিচ, লিড কোয়ালিফিকেশন এবং ট্রানজ্যাকশনাল ভয়েস প্রম্পটের জন্য ব্যবহার করা যায়।',
  },
  {
    question: 'Can I request a custom sample before buying?',
    answer:
      'Yes. The landing page is built around a short custom sample workflow so teams can hear their own script before moving into production.',
    bangla:
      'বাংলা: হ্যাঁ। এই ল্যান্ডিং পেজে ছোট কাস্টম স্যাম্পল ওয়ার্কফ্লো রাখা হয়েছে যাতে টিমগুলো প্রোডাকশনে যাওয়ার আগে নিজেদের স্ক্রিপ্ট শুনতে পারে।',
  },
  {
    question: 'Is this suitable for B2B sales agents and customer calls?',
    answer:
      'Yes. The voice direction is meant to work in customer-facing sales and service contexts where trust, clarity, and local tone matter.',
    bangla:
      'বাংলা: হ্যাঁ। এই ভয়েস ডিরেকশন এমন সেলস ও সার্ভিস ব্যবহারের জন্য তৈরি যেখানে বিশ্বাস, পরিষ্কার যোগাযোগ এবং স্থানীয় টোন খুব গুরুত্বপূর্ণ।',
  },
  {
    question: 'Can developers integrate it into products or AI agents?',
    answer:
      'Yes. The product direction already includes API-oriented use cases for SaaS platforms, voice automation, and AI agent workflows.',
    bangla:
      'বাংলা: হ্যাঁ। এই প্রোডাক্ট ডিরেকশনে ইতিমধ্যে সাস প্ল্যাটফর্ম, ভয়েস অটোমেশন এবং এআই এজেন্ট ওয়ার্কফ্লোর জন্য এপিআই-ভিত্তিক ব্যবহার অন্তর্ভুক্ত আছে।',
  },
  {
    question: 'How fast can we go from script to output?',
    answer:
      'That depends on the workflow, but the intended experience is fast iteration from script input to usable Bangladeshi Bangla voice output for testing and production.',
    bangla:
      'বাংলা: এটি ওয়ার্কফ্লোর ওপর নির্ভর করে, তবে লক্ষ্য হলো স্ক্রিপ্ট ইনপুট থেকে দ্রুত ব্যবহারযোগ্য বাংলাদেশি বাংলা ভয়েস আউটপুট পাওয়া, টেস্টিং এবং প্রোডাকশন দুটোর জন্যই।',
  },
  {
    question: 'Do you support pilot projects for teams?',
    answer:
      'Yes. The site already positions short pilot engagements for teams that want to validate the voice in real sales, support, or content workflows before scaling.',
    bangla:
      'বাংলা: হ্যাঁ। যেসব টিম স্কেল করার আগে বাস্তব সেলস, সাপোর্ট বা কনটেন্ট ওয়ার্কফ্লোতে ভয়েসটি যাচাই করতে চায়, তাদের জন্য ছোট পাইলট প্রজেক্টের সুবিধা রাখা হয়েছে।',
  },
];

const decorativeLetters: DecorativeBanglaLetter[] = [
  { char: 'অ', top: '9%', left: '7%', size: '30px', opacity: 0.05, rotation: '-7deg' },
  { char: 'ও', top: '12%', left: '90%', size: '36px', opacity: 0.05, rotation: '6deg' },
  { char: 'খ', top: '36%', left: '4%', size: '24px', opacity: 0.04, rotation: '11deg' },
  { char: 'ন', top: '48%', left: '95%', size: '28px', opacity: 0.05, rotation: '-8deg' },
  { char: 'শ', top: '73%', left: '8%', size: '34px', opacity: 0.05, rotation: '8deg' },
  { char: 'ষ', top: '85%', left: '88%', size: '30px', opacity: 0.05, rotation: '-10deg' },
];

export function Frame07FAQ() {
  return (
    <div
      className="relative w-full overflow-hidden px-6 py-20 sm:px-8 lg:px-10 lg:py-28"
      style={{ backgroundColor: '#E3DFD4' }}
    >
      <DecorativeBanglaLetters letters={decorativeLetters} />
      <div className="relative z-10 mx-auto max-w-7xl">
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
                  <div className="space-y-3">
                    <p>{faq.answer}</p>
                    <p className="text-[13px] leading-7 text-[#373A40]/72 lg:text-[15px]">{faq.bangla}</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
