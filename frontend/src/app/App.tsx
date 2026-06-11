import { useState } from 'react';
import { Frame01Cover } from './components/Frame01Cover';
import { Frame02ViralProof } from './components/Frame02ViralProof';
import { Frame03B2B } from './components/Frame03B2B';
import { Frame04Creator } from './components/Frame04Creator';
import { Frame05Roadmap } from './components/Frame05Roadmap';
import { Frame06Positioning } from './components/Frame06Positioning';
import { Frame07FAQ } from './components/Frame07FAQ';
import { LeadCaptureDialog, type LeadDialogMode } from './components/LeadCaptureDialog';

export default function App() {
  const [leadDialogMode, setLeadDialogMode] = useState<LeadDialogMode | null>(null);

  const openLeadDialog = (mode: LeadDialogMode) => setLeadDialogMode(mode);

  const sections = [
    { id: 'cover', label: 'Home', component: <Frame01Cover onSampleClick={() => openLeadDialog('sample')} /> },
    { id: 'viral-proof', label: 'Proof', component: <Frame02ViralProof /> },
    { id: 'b2b-agent', label: 'Sales Agent', component: <Frame03B2B onPilotClick={() => openLeadDialog('pilot')} /> },
    { id: 'creator-studio', label: 'Creators', component: <Frame04Creator onSampleClick={() => openLeadDialog('sample')} /> },
    { id: 'roadmap', label: 'Pricing', component: <Frame05Roadmap /> },
    { id: 'positioning', label: 'Products', component: <Frame06Positioning /> },
  ];

  return (
    <main className="w-full overflow-x-hidden bg-[#EEEBE4] text-[#373A40] font-['Hind_Siliguri']">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-[#D2CCBE]/70 bg-[#EEEBE4]/86 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <a href="#cover" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#AE6C4A] text-lg font-bold text-[#EEEBE4]">
              ব
            </span>
            <span className="text-sm font-bold uppercase tracking-[0.14em] text-[#373A40]">
              Bangla Voice AI
            </span>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-semibold text-[#5A5048] md:flex">
            {sections.slice(1).map((section) => (
              <a key={section.id} href={`#${section.id}`} className="transition hover:text-[#AE6C4A]">
                {section.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {sections.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          className={`relative w-full ${index > 0 ? 'scroll-mt-16' : ''}`}
        >
          {section.component}
        </section>
      ))}

      <section id="faq" className="relative w-full scroll-mt-16">
        <Frame07FAQ />
      </section>

      <LeadCaptureDialog
        mode={leadDialogMode}
        open={leadDialogMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLeadDialogMode(null);
          }
        }}
      />
    </main>
  );
}
