UPDATE voice_cards
SET is_active = FALSE,
    updated_at = NOW();

INSERT INTO voice_cards (
  id,
  name,
  script_text,
  english_meaning,
  audio_file,
  duration,
  wave_seed,
  display_order,
  is_active,
  updated_at
)
VALUES
  (1, 'AI Self Service Agent', 'আমি আপনার এআই সেলফ-সার্ভিস এজেন্ট, কীভাবে সাহায্য করতে পারি?', 'An AI self-service agent for handling routine customer requests.', 'voices/public/ai-self-service-agent.wav', 9.72, 42, 0, TRUE, NOW()),
  (2, 'Business Consultant', 'আমি আপনার ব্যবসার প্রয়োজন বুঝে সঠিক সমাধান সাজিয়ে দিতে পারি।', 'A consultant voice for business guidance and solution discovery.', 'voices/public/business-consultant.wav', 10.07, 43, 1, TRUE, NOW()),
  (3, 'Office Receptionist', 'অফিস রিসেপশনে স্বাগতম, আপনার কলটি সঠিক বিভাগে যুক্ত করছি।', 'A front-desk style voice for greeting and call routing.', 'voices/public/office-receptionist.wav', 8.16, 44, 2, TRUE, NOW()),
  (4, 'Appointment Taker', 'আপনার সুবিধামতো সময় অনুযায়ী আমি অ্যাপয়েন্টমেন্ট বুক করে দিতে পারি।', 'A scheduling voice for collecting availability and booking appointments.', 'voices/public/appointment-taker.wav', 9.56, 45, 3, TRUE, NOW()),
  (5, 'Healthcare Assistant', 'স্বাস্থ্যসেবা সংক্রান্ত তথ্য, সময়সূচি ও সহায়তায় আমি আপনার পাশে আছি।', 'A care-support voice for patient information and appointment guidance.', 'voices/public/healthcare-assistant.wav', 9.12, 46, 4, TRUE, NOW()),
  (6, 'Ecommerce Support', 'অর্ডার, ডেলিভারি ও রিটার্ন সংক্রান্ত সহায়তা আমি এখনই দিতে পারি।', 'A support voice for ecommerce order, delivery, and return workflows.', 'voices/public/ecommerce-support.wav', 8.67, 47, 5, TRUE, NOW()),
  (7, 'Banking Fintech Support', 'ব্যাংকিং ও ফিনটেক সেবার আপডেট এবং সহায়তা দ্রুত জানাতে পারি।', 'A financial-support voice for banking and fintech service communication.', 'voices/public/banking-fintech-support.wav', 8.88, 48, 6, TRUE, NOW()),
  (8, 'Real Estate Lead Qualifier', 'প্রপার্টি আগ্রহ, বাজেট ও লোকেশন বুঝে আমি লিড কোয়ালিফাই করি।', 'A lead-qualification voice for real estate inquiry screening.', 'voices/public/real-estate-lead-qualifier.wav', 8.22, 49, 7, TRUE, NOW()),
  (9, 'Education Admission Counsellor', 'ভর্তি, কোর্স ও আবেদন প্রক্রিয়া নিয়ে আমি পরিষ্কার দিকনির্দেশনা দিতে পারি।', 'A counsellor voice for admissions, courses, and application support.', 'voices/public/education-admission-counsellor.wav', 9.32, 50, 8, TRUE, NOW()),
  (10, 'Restaurant Hospitality Reservation', 'রেস্টুরেন্ট ও হসপিটালিটি রিজার্ভেশন দ্রুত নিশ্চিত করতে আমি সাহায্য করি।', 'A reservation voice for restaurant and hospitality booking flows.', 'voices/public/restaurant-hospitality-reservation.wav', 8.79, 51, 9, TRUE, NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  script_text = EXCLUDED.script_text,
  english_meaning = EXCLUDED.english_meaning,
  audio_file = EXCLUDED.audio_file,
  duration = EXCLUDED.duration,
  wave_seed = EXCLUDED.wave_seed,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
