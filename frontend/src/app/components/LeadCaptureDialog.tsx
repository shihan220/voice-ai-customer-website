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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Textarea } from './ui/textarea';

export type LeadDialogMode = 'sample' | 'pilot';

type LeadCaptureDialogProps = {
  currentTokenBalance?: number | null;
  currentUserEmail?: string | null;
  mode: LeadDialogMode | null;
  onNavigate?: (href: string, replace?: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onRefreshSession?: () => Promise<void> | void;
  open: boolean;
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

type SampleRequestInsert = {
  clientName: string;
  companyName?: string | null;
  email: string;
  expectedMonthlyVolume?: string | null;
  messageDetails?: string | null;
  phoneNumber?: string | null;
  referrer?: string | null;
  selectedService?: string | null;
  sourceUrl?: string | null;
  userAgent?: string | null;
};

type SamplePreviewResponse = {
  audioUrl: string | null;
  downloadUrl: string;
  estimatedTokenCost: number;
  finalized: boolean;
  regenerationAttemptsRemaining: number;
  regenerationAttemptsUsed: number;
  sampleId: number;
  tokenBalance?: number;
  tokensDeducted: number;
  wordCount: number;
};

type SamplePreviewState = SamplePreviewResponse & {
  generatedFromKey: string;
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

function normalizeOptionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

class RequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

async function postJson<T>(url: string, body?: unknown, method: 'GET' | 'POST' = 'POST') {
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    method,
  });

  const raw = await response.text();
  const payload = raw ? safeJsonParse(raw) : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && payload.error) ||
      `Request failed with status ${response.status}.`;
    throw new RequestError(message, response.status);
  }

  return payload as T;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function insertLead(payload: SampleRequestInsert) {
  await postJson('/api/sample-requests', payload);
}

function buildPreviewKey(script: string, useCase: string) {
  return `${script.trim()}::${useCase.trim()}`;
}

function toPreviewState(payload: SamplePreviewResponse, generatedFromKey: string): SamplePreviewState {
  return {
    ...payload,
    generatedFromKey,
  };
}

export function LeadCaptureDialog({
  currentTokenBalance = null,
  currentUserEmail = null,
  mode,
  onNavigate,
  onOpenChange,
  onRefreshSession,
  open,
}: LeadCaptureDialogProps) {
  const [sampleForm, setSampleForm] = useState<SampleFormState>(sampleDefaults);
  const [pilotForm, setPilotForm] = useState<PilotFormState>(pilotDefaults);
  const [submitState, setSubmitState] = useState<'idle' | 'saved' | 'submitting'>('idle');
  const [previewState, setPreviewState] = useState<SamplePreviewState | null>(null);
  const [previewAction, setPreviewAction] = useState<null | 'download' | 'finalize' | 'generate' | 'regenerate'>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const isSample = mode === 'sample';
  const currentEmail = isSample ? sampleForm.email : pilotForm.email;
  const currentPreviewKey = buildPreviewKey(sampleForm.script, sampleForm.useCase);
  const previewIsStale = Boolean(previewState && previewState.generatedFromKey !== currentPreviewKey);
  const hasInsufficientTokens = Boolean(
    isSample &&
      previewState &&
      !previewState.finalized &&
      currentTokenBalance !== null &&
      currentTokenBalance < previewState.estimatedTokenCost,
  );

  useEffect(() => {
    if (!open) {
      setSubmitState('idle');
      setPreviewAction(null);
      setPreviewState(null);
      setInfoMessage('');
      setErrorMessage('');
      setSampleForm(sampleDefaults);
      setPilotForm(pilotDefaults);
    }
  }, [open]);

  useEffect(() => {
    if (open && isSample && currentUserEmail && !sampleForm.email) {
      setSampleForm((current) => ({ ...current, email: currentUserEmail }));
    }
  }, [currentUserEmail, isSample, open, sampleForm.email]);

  const dialogCopy = useMemo(() => {
    if (isSample) {
      return {
        badge: 'Sample Preview',
        description:
          'Generate a preview first. Regenerate up to two times before you finalize and spend tokens.',
        title: 'Prepare your Bangla voice sample preview.',
      };
    }

    return {
      badge: 'Pilot Request',
      description: 'Share your pilot requirements. We will save the request and follow up from the lead queue.',
      title: 'Book the 7-day Bangla AI agent pilot.',
    };
  }, [isSample]);

  if (!mode) return null;

  const validate = () => {
    if (isSample) {
      if (!sampleForm.fullName.trim() || !sampleForm.email.trim() || !sampleForm.script.trim() || !sampleForm.useCase.trim()) {
        return 'Fill the required fields before generating a preview.';
      }
    } else if (!pilotForm.fullName.trim() || !pilotForm.email.trim() || !pilotForm.company.trim() || !pilotForm.goal.trim()) {
      return 'Fill the required fields before saving this request.';
    }

    if (!emailPattern.test(currentEmail.trim())) {
      return 'Enter a valid email address.';
    }

    return null;
  };

  const buildMetadata = () => ({
    referrer: typeof document !== 'undefined' ? normalizeOptionalValue(document.referrer) : null,
    sourceUrl: typeof window !== 'undefined' ? normalizeOptionalValue(window.location.href) : null,
    userAgent: typeof navigator !== 'undefined' ? normalizeOptionalValue(navigator.userAgent) : null,
  });

  const buildPilotPayload = (): SampleRequestInsert => ({
    clientName: pilotForm.fullName.trim(),
    companyName: normalizeOptionalValue(pilotForm.company),
    email: pilotForm.email.trim(),
    expectedMonthlyVolume: normalizeOptionalValue(pilotForm.monthlyVolume),
    messageDetails: normalizeOptionalValue(pilotForm.goal),
    phoneNumber: normalizeOptionalValue(pilotForm.phone),
    selectedService: 'b2b_agent_pilot',
    ...buildMetadata(),
  });

  const buildSamplePayload = () => ({
    clientName: sampleForm.fullName.trim(),
    companyName: normalizeOptionalValue(sampleForm.company),
    email: sampleForm.email.trim(),
    scriptText: sampleForm.script.trim(),
    selectedService: sampleForm.useCase.trim(),
    ...buildMetadata(),
  });

  const handleGuardFailure = (error: unknown) => {
    if (!(error instanceof RequestError) || !onNavigate) {
      return false;
    }

    if (error.status === 401) {
      onOpenChange(false);
      onNavigate('/login?next=lead&mode=sample', true);
      return true;
    }

    if (error.status === 403) {
      onOpenChange(false);

      if (error.message.toLowerCase().includes('phone')) {
        onNavigate('/verify-phone?next=lead&mode=sample', true);
        return true;
      }

      onNavigate('/verify-email?next=lead&mode=sample', true);
      return true;
    }

    return false;
  };

  const handlePilotSave = async () => {
    const validationError = validate();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitState('submitting');
    setErrorMessage('');
    setInfoMessage('');

    try {
      await insertLead(buildPilotPayload());
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

  const handleGeneratePreview = async () => {
    const validationError = validate();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setPreviewAction('generate');
    setErrorMessage('');
    setInfoMessage('');

    try {
      const payload = await postJson<SamplePreviewResponse>('/api/samples/generate-preview', buildSamplePayload());
      setPreviewState(toPreviewState(payload, currentPreviewKey));
      setInfoMessage('Preview ready. Finalize once when you are satisfied, or regenerate while free tries remain.');
    } catch (error) {
      if (handleGuardFailure(error)) {
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate a preview.');
    } finally {
      setPreviewAction(null);
    }
  };

  const handleRegeneratePreview = async () => {
    if (!previewState) {
      return;
    }

    const validationError = validate();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setPreviewAction('regenerate');
    setErrorMessage('');
    setInfoMessage('');

    try {
      const payload = await postJson<SamplePreviewResponse>('/api/samples/regenerate-preview', {
        sampleId: previewState.sampleId,
        ...buildSamplePayload(),
      });
      setPreviewState(toPreviewState(payload, currentPreviewKey));
      setInfoMessage('Preview regenerated. Review the audio again before finalizing.');
    } catch (error) {
      if (handleGuardFailure(error)) {
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Failed to regenerate the preview.');
    } finally {
      setPreviewAction(null);
    }
  };

  const handleFinalizePreview = async () => {
    if (!previewState) {
      return;
    }

    setPreviewAction('finalize');
    setErrorMessage('');
    setInfoMessage('');

    try {
      const payload = await postJson<SamplePreviewResponse & { tokenBalance: number }>('/api/samples/finalize', {
        sampleId: previewState.sampleId,
      });
      setPreviewState((current) =>
        current ? toPreviewState(payload, current.generatedFromKey) : toPreviewState(payload, currentPreviewKey),
      );
      setInfoMessage(
        payload.tokensDeducted > 0
          ? `Preview finalized. ${payload.tokensDeducted} tokens were deducted.`
          : 'Preview was already finalized. No additional tokens were deducted.',
      );
      await onRefreshSession?.();
    } catch (error) {
      if (handleGuardFailure(error)) {
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Failed to finalize the preview.');
    } finally {
      setPreviewAction(null);
    }
  };

  const handleDownloadPreview = async () => {
    if (!previewState) {
      return;
    }

    setPreviewAction('download');
    setErrorMessage('');
    setInfoMessage('');

    try {
      let activePreview = previewState;

      if (!previewState.finalized) {
        const finalizePayload = await postJson<SamplePreviewResponse & { tokenBalance: number }>('/api/samples/finalize', {
          sampleId: previewState.sampleId,
        });
        activePreview = toPreviewState(finalizePayload, previewState.generatedFromKey);
        setPreviewState(activePreview);
      }

      const response = await fetch(activePreview.downloadUrl, {
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const raw = await response.text();
        const payload = raw ? safeJsonParse(raw) : null;
        const message =
          (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && payload.error) ||
          `Download failed with status ${response.status}.`;
        throw new RequestError(message, response.status);
      }

      const blob = await response.blob();
      const downloadLink = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get('content-disposition');
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] ?? `sample-preview-${activePreview.sampleId}.wav`;

      downloadLink.href = objectUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      URL.revokeObjectURL(objectUrl);

      setInfoMessage('Preview downloaded. The same sample stays available here without another token deduction.');
      await onRefreshSession?.();
    } catch (error) {
      if (handleGuardFailure(error)) {
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Failed to download the preview.');
    } finally {
      setPreviewAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-[#D2CCBE] p-0 sm:max-w-[720px]"
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
            <DialogDescription className="max-w-[600px] text-sm leading-6 text-[#373A40]/72 lg:text-[15px]">
              {dialogCopy.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        {!isSample && submitState === 'saved' ? (
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
                placeholder="Email"
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
              <>
                <Textarea
                  className="mt-4 min-h-32"
                  placeholder="Paste the sample script here"
                  value={sampleForm.script}
                  onChange={(event) => setSampleForm((current) => ({ ...current, script: event.target.value }))}
                />

                {!previewState ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleGeneratePreview()}
                      disabled={previewAction === 'generate'}
                      className="rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-70"
                      style={{ backgroundColor: '#AE6C4A', color: '#EEEBE4' }}
                    >
                      {previewAction === 'generate' ? 'Generating preview...' : 'Generate preview'}
                    </button>
                    {currentTokenBalance !== null ? (
                      <div className="rounded-full border border-[#D2CCBE] bg-white/80 px-4 py-2 text-sm font-semibold text-[#373A40]">
                        Tokens available: {currentTokenBalance.toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div
                    className="mt-5 rounded-[24px] border p-5"
                    style={{ backgroundColor: '#EEEBE4', borderColor: '#D2CCBE' }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-[#373A40]">
                          {previewState.finalized ? 'Preview finalized' : 'Preview ready'}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[#373A40]/75">
                          {previewState.wordCount} words • {previewState.estimatedTokenCost} tokens estimated
                        </p>
                      </div>
                      <div className="rounded-full border border-[#D2CCBE] bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7B6557]">
                        {previewState.regenerationAttemptsRemaining} regenerate
                        {previewState.regenerationAttemptsRemaining === 1 ? '' : 's'} left
                      </div>
                    </div>

                    {previewState.audioUrl ? (
                      <div className="mt-4">
                        <audio controls className="w-full" src={previewState.audioUrl}>
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    ) : null}

                    {previewIsStale ? (
                      <div className="mt-4 rounded-2xl border border-[#D8B7A6] bg-[#FBEFEA] px-4 py-3 text-sm text-[#8D4F37]">
                        You changed the script or use case. Regenerate the preview before finalizing or downloading.
                      </div>
                    ) : null}

                    {hasInsufficientTokens ? (
                      <div className="mt-4 rounded-2xl border border-[#D8B7A6] bg-[#FBEFEA] px-4 py-3 text-sm text-[#8D4F37]">
                        Insufficient token balance for this preview. Upgrade or add credits before finalizing.
                      </div>
                    ) : null}

                    {infoMessage ? (
                      <div className="mt-4 rounded-2xl border border-[#C6D8C9] bg-[#EEF8EE] px-4 py-3 text-sm text-[#375F3C]">
                        {infoMessage}
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleRegeneratePreview()}
                        disabled={
                          previewAction !== null ||
                          previewState.finalized ||
                          previewState.regenerationAttemptsRemaining <= 0
                        }
                        className="rounded-xl border border-[#D2CCBE] bg-white/85 px-5 py-3 text-sm font-semibold text-[#5A514A] disabled:opacity-70"
                      >
                        {previewAction === 'regenerate' ? 'Regenerating...' : 'Regenerate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleFinalizePreview()}
                        disabled={previewAction !== null || previewIsStale || hasInsufficientTokens}
                        className="rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-70"
                        style={{ backgroundColor: '#AE6C4A', color: '#EEEBE4' }}
                      >
                        {previewAction === 'finalize' ? 'Finalizing...' : 'Done'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadPreview()}
                        disabled={previewAction !== null || previewIsStale || hasInsufficientTokens}
                        className="rounded-xl border border-[#C89C84] bg-[#F6E4D6] px-5 py-3 text-sm font-semibold text-[#8A5438] disabled:opacity-70"
                      >
                        {previewAction === 'download' ? 'Downloading...' : 'Download'}
                      </button>
                    </div>

                    {previewState.finalized && (previewState.tokenBalance ?? currentTokenBalance) !== null ? (
                      <div className="mt-4 text-sm font-semibold text-[#373A40]">
                        Updated token balance: {(previewState.tokenBalance ?? currentTokenBalance ?? 0).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <>
                <Input
                  className="mt-4"
                  placeholder="Best callback number"
                  value={pilotForm.phone}
                  onChange={(event) => setPilotForm((current) => ({ ...current, phone: event.target.value }))}
                />
                <Textarea
                  className="mt-4 min-h-28"
                  placeholder="What should the pilot handle for your team?"
                  value={pilotForm.goal}
                  onChange={(event) => setPilotForm((current) => ({ ...current, goal: event.target.value }))}
                />
              </>
            )}

            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-[#D8B7A6] bg-[#FBEFEA] px-4 py-3 text-sm text-[#8D4F37]">
                {errorMessage}
              </div>
            ) : null}

            <DialogFooter className="mt-6 flex flex-wrap gap-3 sm:justify-start">
              {!isSample ? (
                <button
                  type="button"
                  onClick={() => void handlePilotSave()}
                  className="rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-70"
                  disabled={submitState === 'submitting'}
                  style={{ backgroundColor: '#AE6C4A', color: '#EEEBE4' }}
                >
                  {submitState === 'submitting' ? 'Saving...' : 'Save pilot request'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xl border border-[#D2CCBE] bg-white/80 px-6 py-3 text-sm font-semibold text-[#5A514A]"
              >
                {isSample ? 'Close' : 'Cancel'}
              </button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
