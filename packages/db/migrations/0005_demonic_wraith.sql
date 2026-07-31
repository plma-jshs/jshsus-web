ALTER TABLE `activity_requests` ADD `advisor_teacher_name_snapshot` varchar(128);--> statement-breakpoint

UPDATE `activity_requests` request
INNER JOIN `staff_profiles` staff ON staff.user_id = request.teacher_id
SET request.advisor_teacher_name_snapshot = staff.name
WHERE request.advisor_teacher_name_snapshot IS NULL;--> statement-breakpoint

UPDATE `activity_requests` request
INNER JOIN `legacy_activity_archives` archive
  ON request.issued_number = CONCAT(
    'LEGACY-SSAM-',
    LEFT(SHA2(archive.source_id, 256), 48)
  )
SET
  request.advisor_teacher_name_snapshot = NULLIF(TRIM(archive.advisor_teacher_name), ''),
  request.starts_at = DATE_SUB(
    STR_TO_DATE(
      CONCAT(
        DATE_FORMAT(archive.activity_date, '%Y-%m-%d'),
        ' ',
        JSON_UNQUOTE(JSON_EXTRACT(archive.time_ranges, '$[0].startsAt'))
      ),
      '%Y-%m-%d %H:%i'
    ),
    INTERVAL 9 HOUR
  ),
  request.ends_at = DATE_SUB(
    STR_TO_DATE(
      CONCAT(
        DATE_FORMAT(archive.activity_date, '%Y-%m-%d'),
        ' ',
        JSON_UNQUOTE(
          JSON_EXTRACT(
            archive.time_ranges,
            CONCAT('$[', JSON_LENGTH(archive.time_ranges) - 1, '].endsAt')
          )
        )
      ),
      '%Y-%m-%d %H:%i'
    ),
    INTERVAL 9 HOUR
  )
WHERE JSON_LENGTH(archive.time_ranges) > 0;
