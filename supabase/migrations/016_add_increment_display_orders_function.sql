-- Function to increment all display_orders by 1 (to make room at the top)
CREATE OR REPLACE FUNCTION increment_display_orders()
RETURNS void AS $$
BEGIN
  UPDATE featured_quotes
  SET display_order = display_order + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
