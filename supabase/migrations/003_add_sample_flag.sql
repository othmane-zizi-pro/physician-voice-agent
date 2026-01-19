-- Add is_sample flag to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_sample BOOLEAN DEFAULT FALSE;

-- Insert sample calls with fake quotes for demo
INSERT INTO calls (transcript, quotable_quote, duration_seconds, ip_address, latitude, longitude, city, region, country, is_sample) VALUES
('You: I spent 45 minutes on the phone with insurance just to get a medication approved that costs $12.
Doc: The system is designed to exhaust you into compliance.
You: Exactly. They want me to give up. But my patient needs this medication.
Doc: And yet you keep fighting. That says everything about who you are as a physician.',
'I spent 45 minutes on the phone with insurance just to get a medication approved that costs $12. They want me to give up.',
287, '73.162.118.42', 40.7128, -74.0060, 'New York', 'New York', 'United States', TRUE),

('You: I went into medicine to help people, not to fight prior authorizations all day.
Doc: The paperwork has become the patient.
You: Some days I see more forms than faces. It''s soul-crushing.
Doc: And yet here you are, still trying to do right by your patients despite the system.',
'Some days I see more forms than faces. It''s soul-crushing.',
342, '184.23.156.89', 34.0522, -118.2437, 'Los Angeles', 'California', 'United States', TRUE),

('You: The PE firm that bought our practice promised nothing would change. Everything changed.
Doc: Private equity sees healthcare as a spreadsheet, not a calling.
You: They cut our staff by 30% and expect the same output. My nurses are burning out.
Doc: You''re all being squeezed to maximize someone else''s returns.',
'The PE firm promised nothing would change. Everything changed. They cut our staff by 30% and expect the same output.',
456, '98.45.67.123', 41.8781, -87.6298, 'Chicago', 'Illinois', 'United States', TRUE),

('You: I had a patient cry because they couldn''t afford their insulin. I felt so helpless.
Doc: The system puts you in impossible positions daily.
You: I became a doctor to heal people, not to watch them suffer because of money.
Doc: That empathy is exactly why this hurts so much. You haven''t lost your humanity.',
'I became a doctor to heal people, not to watch them suffer because of money.',
298, '72.134.89.201', 29.7604, -95.3698, 'Houston', 'Texas', 'United States', TRUE),

('You: I haven''t had a real lunch break in three years. I eat standing up between patients.
Doc: That''s not sustainable. You know that better than anyone.
You: I know. But if I slow down, the waitlist grows. People suffer.
Doc: You''re sacrificing yourself on the altar of a broken system.',
'I haven''t had a real lunch break in three years. I eat standing up between patients.',
234, '68.45.123.78', 47.6062, -122.3321, 'Seattle', 'Washington', 'United States', TRUE),

('You: My EHR logged me clicking 4,000 times in one shift. Four thousand clicks to document care.
Doc: The electronic health record has become an electronic burden record.
You: I spend more time looking at screens than patients. This isn''t why I went to med school.
Doc: The tragedy is that no one asked physicians what they actually needed.',
'My EHR logged me clicking 4,000 times in one shift. I spend more time looking at screens than patients.',
378, '156.78.234.56', 33.4484, -112.0740, 'Phoenix', 'Arizona', 'United States', TRUE),

('You: A 15-minute visit isn''t enough time to say hello, let alone manage complex chronic conditions.
Doc: The visit length was designed by accountants, not clinicians.
You: My patients deserve better. I deserve better. We all do.
Doc: The fact that you still care after all this says everything.',
'A 15-minute visit isn''t enough time to say hello, let alone manage complex chronic conditions.',
312, '45.89.167.234', 39.7392, -104.9903, 'Denver', 'Colorado', 'United States', TRUE),

('You: I was reported to the medical board for prescribing opioids to a terminal cancer patient.
Doc: The pendulum has swung so far that compassion becomes liability.
You: He was dying. He deserved to die without pain. And I got investigated for it.
Doc: You did the right thing. The system failed both of you.',
'He was dying. He deserved to die without pain. And I got investigated for it.',
423, '112.67.89.145', 25.7617, -80.1918, 'Miami', 'Florida', 'United States', TRUE);

-- Create index for sample flag
CREATE INDEX IF NOT EXISTS idx_calls_is_sample ON calls(is_sample);
