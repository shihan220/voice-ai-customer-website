import { BanglaVoiceHero } from './BanglaVoiceHero';

type Frame01CoverProps = {
  onSampleClick?: () => void;
};

export function Frame01Cover({ onSampleClick }: Frame01CoverProps) {
  return <BanglaVoiceHero onSampleClick={onSampleClick} />;
}
