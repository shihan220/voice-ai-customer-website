import { useEffect, useMemo, useState } from 'react';
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
import {
  SUPABASE_LEADS_TABLE,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from '../config/supabase';

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

type SupabaseLeadInsert = {
  business_context?: string | null;
  company_name?: string | null;
  expected_monthly_volume?: string | null;
  full_name: string;
  primary_use_case?: string | null;
  referrer?: string | null;
  source_url?: string | null;
  user_agent?: string | null;
  work_email: string;
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSupabaseConfigured() {
  return SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.includes('PASTE_MY_');
}

function normalizeOptionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function insertLead(payload: SupabaseLeadInsert) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase publishable key is not configured yet.');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_LEADS_TABLE}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Supabase request failed with status ${response.status}.`);
  }
}

export function LeadCaptureDialog({ mode, open, onOpenChange }: LeadCaptureDialogProps) {
  const [sampleForm, setSampleForm] = useState<SampleFormState>(sampleDefaults);
  const [pilotForm, setPilotForm] = useState<PilotFormState>(pilotDefaults);
  const [submitState, setSubmitState] = useState<'idle' | 'saved' | 'submitting'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open) {
      setSubmitState('idle');
      setErrorMessage('');
      setSampleForm(sampleDefaults);
      setPilotForm(pilotDefaults);
    }
  }, [open]);

  const isSample = mode === 'sample';

  const dialogCopy = useMemo(() => {
    if (isSample) {
      return {
        badge: 'Sample Request',
        cta: submitState === 'submitting' ? 'Saving...' : 'Save sample brief',
        description: 'Share your script and use case. We will save the request and follow up from the lead queue.',
        title: 'Prepare your Bangla voice sample request.',
      };
    }

    return {
      badge: 'Pilot Request',
      cta: submitState === 'submitting' ? 'Saving...' : 'Save pilot request',
      description: 'Share your pilot requirements. We will save the request and follow up from the lead queue.',
      title: 'Book the 7-day Bangla AI agent pilot.',
    };
  }, [isSample, submitState]);

  if (!mode) return null;

  const currentEmail = isSample ? sampleForm.email : pilotForm.email;

  const validate = () => {
    if (isSample) {
      if (!sampleForm.fullName.trim() || !sampleForm.email.trim() || !sampleForm.script.trim() || !sampleForm.useCase.trim()) {
        return 'Fill the required fields before saving this request.';
      }
    } else if (!pilotForm.fullName.trim() || !pilotForm.email.trim() || !pilotForm.company.trim() || !pilotForm.goal.trim()) {
      return 'Fill the required fields before saving this request.';
    }

    if (!emailPattern.test(currentEmail.trim())) {
      return 'Enter a valid work email address.';
    }

    return null;
  };

  const buildPayload = (): SupabaseLeadInsert => {
    const metadata = {
      referrer: typeof document !== 'undefined' ? normalizeOptionalValue(document.referrer) : null,
      source_url: typeof window !== 'undefined' ? normalizeOptionalValue(window.location.href) : null,
      user_agent: typeof navigator !== 'undefined' ? normalizeOptionalValue(navigator.userAgent) : null,
    };

    if (isSample) {
      return {
        full_name: sampleForm.fullName.trim(),
        company_name: normalizeOptionalValue(sampleForm.company),
        work_email: sampleForm.email.trim(),
        primary_use_case: normalizeOptionalValue(sampleForm.useCase),
        expected_monthly_volume: null,
        business_context: normalizeOptionalValue(sampleForm.script),
        ...metadata,
      };
    }

    return {
      full_name: pilotForm.fullName.trim(),
      company_name: normalizeOptionalValue(pilotForm.company),
      work_email: pilotForm.email.trim(),
      primary_use_case: 'b2b_agent_pilot',
      expected_monthly_volume: normalizeOptionalValue(pilotForm.monthlyVolume),
      business_context: normalizeOptionalValue(pilotForm.goal),
      ...metadata,
    };
  };

  const handleSave = async () => {
    const validationError = validate();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitState('submitting');
    setErrorMessage('');

    try {
      await insertLead(buildPayload());
      setSubmitState('saved');
    } catch (error) {
      setSubmitState('idle');
      setErrorMessage(
        error instanceof Error && error.message
          ? `Submission failed. ${error.message}`
          : 'Submission failed. Please try again.',
      );
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
              <p className="mb-2 text-xl font-bold text-[#373A40]">Registration saved.</p>
              <p className="text-sm leading-6 text-[#373A40]/75 lg:text-[15px]">
                We will follow up by email.
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

            {errorMessage ? (
              <p className="mt-4 text-sm font-medium text-[#995842]">
                {errorMessage}
              </p>
            ) : null}

            <DialogFooter className="mt-6 sm:justify-start">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={submitState === 'submitting'}
                className="rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-70"
                style={{ backgroundColor: '#AE6C4A', color: '#EEEBE4' }}
              >
                {dialogCopy.cta}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitState === 'submitting'}
                className="rounded-xl border px-6 py-3 text-sm font-semibold disabled:opacity-70"
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
