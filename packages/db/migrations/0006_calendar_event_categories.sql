UPDATE `school_events`
SET
  `is_holiday` = (`is_holiday` = true OR `category` = 'holiday'),
  `category` = CASE
    WHEN `is_holiday` = true THEN 'holiday'
    WHEN `category` = 'observance' THEN 'observance'
    ELSE 'school'
  END;
