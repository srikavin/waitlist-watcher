CREATE OR REPLACE TABLE `${project}.${dataset}.snapshots_latest_sections`
AS
SELECT
  timestamp,
  semester,
  department,
  course,
  course_name,
  course_description,
  section,
  instructor,
  open_seats,
  total_seats,
  waitlist,
  holdfile,
  meetings_json
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY semester, department, course, section
      ORDER BY timestamp DESC, scrape_published_at DESC
    ) AS rn
  FROM `${project}.${dataset}.${snapshots_table}`
)
WHERE rn = 1;
