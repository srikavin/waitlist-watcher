DECLARE run_date DATE DEFAULT DATE_SUB(CURRENT_DATE("UTC"), INTERVAL 1 DAY);
DECLARE export_uri STRING;
DECLARE table_name STRING DEFAULT "${project}.${dataset}.section_daily_leaderboard_latest";

SET export_uri = FORMAT(
  'gs://${output_bucket}/section-leaderboard/day=%s/*.json',
  FORMAT_DATE('%Y%m%d', run_date)
);

CREATE OR REPLACE TABLE `${project}.${dataset}.section_daily_leaderboard_latest` AS
SELECT
  day,
  semester,
  department,
  course,
  section,
  event_count,
  open_seat_available_count,
  instructor_changed_count,
  meeting_times_changed_count,
  open_seat_churn,
  waitlist_increase_total
FROM `${project}.${dataset}.section_daily_stats`
WHERE day = run_date
ORDER BY event_count DESC, open_seat_churn DESC
LIMIT 2000;

EXECUTE IMMEDIATE FORMAT("""
  EXPORT DATA OPTIONS (
    uri = '%s',
    format = 'JSON',
    overwrite = true
  ) AS
  SELECT *
  FROM `%s`
""", export_uri, table_name);
