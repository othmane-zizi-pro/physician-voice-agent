-- Add sample lead data for demo purposes
INSERT INTO leads (call_id, is_physician_owner, interested_in_collective, name, email) VALUES
  (NULL, true, true, 'Dr. Sarah Mitchell', 'sarah.mitchell@example.com'),
  (NULL, true, true, 'Dr. James Chen', 'jchen@privatepractice.com'),
  (NULL, true, false, NULL, NULL),
  (NULL, true, true, 'Dr. Maria Rodriguez', 'mrodriguez@familymed.org'),
  (NULL, false, NULL, NULL, NULL),
  (NULL, true, true, 'Dr. Robert Kim', 'rkim@orthoclinic.com'),
  (NULL, true, false, NULL, NULL),
  (NULL, false, NULL, NULL, NULL),
  (NULL, true, true, 'Dr. Emily Watson', 'ewatson@dermatologyassoc.com'),
  (NULL, true, true, 'Dr. Michael Johnson', 'mjohnson@cardiocare.net');
