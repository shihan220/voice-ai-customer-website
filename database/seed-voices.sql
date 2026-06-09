UPDATE voice_cards
SET is_active = FALSE,
    updated_at = NOW();

INSERT INTO voice_cards (
  id,
  name,
  script_text,
  audio_file,
  duration,
  wave_seed,
  display_order,
  is_active,
  updated_at
)
VALUES
  (1, 'Introductory business voice', 'নমস্কার, আমি কী পিলার এআই থেকে বলছি।', 'voices/public/greeting.wav', 3.2, 42, 0, TRUE, NOW()),
  (2, 'Time-sensitive operational status', 'আপনার ডেলিভারি আজ বিকেলের মধ্যে পৌঁছে যাবে।', 'voices/public/delivery-update.wav', 4.1, 43, 1, TRUE, NOW()),
  (3, 'Transactional reassurance', 'আপনার পেমেন্ট সফল হয়েছে, ধন্যবাদ।', 'voices/public/payment-success.wav', 2.9, 44, 2, TRUE, NOW()),
  (4, 'Conversion-oriented customer prompt', 'আপনি চাইলে এখনই একটি ডেমো কল বুক করতে পারেন।', 'voices/public/demo-booking.wav', 3.5, 45, 3, TRUE, NOW()),
  (5, 'Trust-critical warning language', 'নিরাপত্তার জন্য ওটিপি বা পাসওয়ার্ড কাউকে শেয়ার করবেন না।', 'voices/public/security-notice.wav', 4.8, 46, 4, TRUE, NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  script_text = EXCLUDED.script_text,
  audio_file = EXCLUDED.audio_file,
  duration = EXCLUDED.duration,
  wave_seed = EXCLUDED.wave_seed,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
