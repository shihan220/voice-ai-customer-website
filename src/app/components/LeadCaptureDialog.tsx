import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export type LeadDialogMode = 'sample' | 'pilot';

type LeadCaptureDialogProps = {
  mode: LeadDialogMode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SampleFormState = {
  company: string;
  email: string;
  fullName: string;
  script: string;
  useCase: string;
};

type PilotFormState = {
  company: string;
  email: string;
  fullName: string;
  goal: string;
  monthlyVolume: string;
  phone: string;
};

const sampleDefaults: SampleFormState = {
  company: '',
  email: '',
  fullName: '',
  script: '',
  useCase: '',
};

const pilotDefaults: PilotFormState = {
  company: '',
  email: '',
  fullName: '',
  goal: '',
  monthlyVolume: '',
  phone: '',
};

function appendLeadRecord(type: LeadDialogMode, payload: Record<string, string>) {
  const storageKey = 'bangla-voice-ai-leads';
  const record = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${type}-${Date.now()}`,
    payload,
    savedAt: new Date().toISOString(),
    type,
  };

  const existing = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as typeof record[];
  window.localStorage.setItem(storageKey, JSON.stringify([record, ...existing].slice(0, 50)));
}

export function LeadCaptureDialog({ mode, open, onOpenChange }: LeadCaptureDialogProps) {
  const [sampleForm, setSampleForm] = useState<SampleFormState>(sampleDefaults);
  const [pilotForm, setPilotForm] = useState<PilotFormState>(pilotDefaults);
  const [submitState, setSubmitState] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!open) {
      setSubmitState('idle');
      setSampleForm(sampleDefaults);
      setPilotForm(pilotDefaults);
    }
  }, [open]);

  if (!mode) return null;

  const isSample = mode === 'sample';

  const dialogCopy = isSample
    ? {
        badge: 'Sample Request',
        cta: 'Save sample brief',
        description: 'This form works now by saving the brief locally. The sample API can be plugged into this flow later.',
        title: 'Prepare your Bangla voice sample request.',
      }
    : {
        badge: 'Pilot Request',
        cta: 'Save pilot request',
        description: 'This captures pilot leads in the browser right now so the website feels operational before backend routing is connected.',
        title: 'Book the 7-day Bangla AI agent pilot.',
      };

  const handleSave = () => {
    try {
      if (isSample) {
        if (!sampleForm.fullName || !sampleForm.email || !sampleForm.script || !sampleForm.useCase) {
          setSubmitState('error');
          return;
        }

        appendLeadRecord('sample', sampleForm);
        setSubmitState('saved');
        return;
      }

      if (!pilotForm.fullName || !pilotForm.email || !pilotForm.company || !pilotForm.goal) {
        setSubmitState('error');
        return;
      }

      appendLeadRecord('pilot', pilotForm);
      setSubmitState('saved');
    } catch {
      setSubmitState('error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-[#D2CCBE] p-0 sm:max-w-[680px]"
        style={{ backgroundColor: '#F6F2EA', color: '#373A40' }}
      >
        <div className="border-b border-[#D2CCBE] px-6 py-5 lg:px-8">
          <div
            className="mb-4 inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ backgroundColor: '#EEEBE4', borderColor: '#D2CCBE', color: '#AE6C4A' }}
          >
            {dialogCopy.badge}
          </div>

          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl font-bold text-[#373A40] lg:text-[30px]">
              {dialogCopy.title}
            </DialogTitle>
            <DialogDescription className="max-w-[560px] text-sm leading-6 text-[#373A40]/72 lg:text-[15px]">
              {dialogCopy.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        {submitState === 'saved' ? (
          <div className="px-6 py-8 lg:px-8">
            <div
              className="rounded-2xl border p-5"
              style={{ backgroundColor: '#EEEBE4', borderColor: '#D2CCBE' }}
            >
              <p className="mb-2 text-xl font-bold text-[#373A40]">Saved successfully.</p>
              <p className="text-sm leading-6 text-[#373A40]/75 lg:text-[15px]">
                {isSample
                  ? 'The sample request brief is stored locally and ready for API hookup when you define that endpoint.'
                  : 'The pilot request is stored locally so the site can operate like a live lead-capture experience right now.'}
              </p>
            </div>

            <DialogFooter className="mt-6 sm:justify-start">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xl px-6 py-3 text-sm font-semibold"
                style={{ backgroundColor: '#AE6C4A', color: '#EEEBE4' }}
              >
                Close
              </button>
            </DialogFooter>
          </div>
        ) : (
          <div className="px-6 py-6 lg:px-8">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                placeholder="Full name"
                value={isSample ? sampleForm.fullName : pilotForm.fullName}
                onChange={(event) =>
                  isSample
                    ? setSampleForm((current) => ({ ...current, fullName: event.target.value }))
                    : setPilotForm((current) => ({ ...current, fullName: event.target.value }))
                }
              />
              <Input
                placeholder="Work email"
                type="email"
                value={isSample ? sampleForm.email : pilotForm.email}
                onChange={(event) =>
                  isSample
                    ? setSampleForm((current) => ({ ...current, email: event.target.value }))
                    : setPilotForm((current) => ({ ...current, email: event.target.value }))
                }
              />
              <Input
                placeholder="Company or brand"
                value={isSample ? sampleForm.company : pilotForm.company}
                onChange={(event) =>
                  isSample
                    ? setSampleForm((current) => ({ ...current, company: event.target.value }))
                    : setPilotForm((current) => ({ ...current, company: event.target.value }))
                }
              />

              {isSample ? (
                <Select
                  value={sampleForm.useCase}
                  onValueChange={(value) => setSampleForm((current) => ({ ...current, useCase: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Primary use case" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ugc">UGC / Creator ad</SelectItem>
                    <SelectItem value="avatar">AI Avatar / Dubbing</SelectItem>
                    <SelectItem value="sales">Sales / Outreach</SelectItem>
                    <SelectItem value="support">Support / Calls</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Monthly call volume"
                  value={pilotForm.monthlyVolume}
                  onChange={(event) => setPilotForm((current) => ({ ...current, monthlyVolume: event.target.value }))}
                />
              )}
            </div>

            {isSample ? (
              <Textarea
                className="mt-4 min-h-28"
                placeholder="Paste the 30-second sample script here"
                value={sampleForm.script}
                onChange={(event) => setSampleForm((current) => ({ ...current, script: event.target.value }))}
              />
            ) : (
              <>
                <Input
                  className="mt-4"
                  placeholder="Phone or WhatsApp"
                  value={pilotForm.phone}
                  onChange={(event) => setPilotForm((current) => ({ ...current, phone: event.target.value }))}
                />
                <Textarea
                  className="mt-4 min-h-28"
                  placeholder="What should the pilot prove for your team?"
                  value={pilotForm.goal}
                  onChange={(event) => setPilotForm((current) => ({ ...current, goal: event.target.value }))}
                />
              </>
            )}

            {submitState === 'error' ? (
              <p className="mt-4 text-sm font-medium text-[#995842]">
                Fill the required fields before saving this request.
              </p>
            ) : null}

            <DialogFooter className="mt-6 sm:justify-start">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl px-6 py-3 text-sm font-semibold"
                style={{ backgroundColor: '#AE6C4A', color: '#EEEBE4' }}
              >
                {dialogCopy.cta}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xl border px-6 py-3 text-sm font-semibold"
                style={{ borderColor: '#D2CCBE', color: '#373A40' }}
              >
                Cancel
              </button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
