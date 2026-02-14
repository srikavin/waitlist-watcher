CREATE TEMP TABLE latest_sections AS
SELECT * EXCEPT(rn)
FROM (
  SELECT
    semester,
    department,
    course,
    section,
    open_seats,
    total_seats,
    holdfile,
    waitlist,
    timestamp,
    scrape_published_at,
    ROW_NUMBER() OVER (
      PARTITION BY semester, department, course, section
      ORDER BY timestamp DESC, scrape_published_at DESC
    ) AS rn
  FROM `${project}.${dataset}.${snapshots_table}`
  WHERE semester IS NOT NULL
    AND department IS NOT NULL
    AND course IS NOT NULL
    AND section IS NOT NULL
)
WHERE rn = 1;

CREATE OR REPLACE TABLE `${project}.${dataset}.stats_most_waitlisted_courses_latest`
AS
SELECT
  semester,
  department,
  course,
  SUM(IFNULL(waitlist, 0)) AS total_waitlist,
  COUNT(*) AS sections,
  MAX(IFNULL(waitlist, 0)) AS max_section_waitlist
FROM latest_sections
GROUP BY semester, department, course
QUALIFY ROW_NUMBER() OVER (PARTITION BY semester ORDER BY total_waitlist DESC, max_section_waitlist DESC) <= 120;

CREATE OR REPLACE TABLE `${project}.${dataset}.stats_most_waitlisted_sections_latest`
AS
SELECT
  semester,
  department,
  course,
  section,
  IFNULL(waitlist, 0) AS waitlist,
  IFNULL(open_seats, 0) AS open_seats,
  IFNULL(total_seats, 0) AS total_seats,
  IFNULL(holdfile, 0) AS holdfile,
  SAFE_DIVIDE(IFNULL(waitlist, 0), NULLIF(IFNULL(total_seats, 0), 0)) AS waitlist_ratio
FROM latest_sections
QUALIFY ROW_NUMBER() OVER (PARTITION BY semester ORDER BY IFNULL(waitlist, 0) DESC, IFNULL(total_seats, 0) DESC) <= 20000;

EXPORT DATA OPTIONS (
  uri = 'gs://${output_bucket}/stats/most_waitlisted_courses/most-waitlisted-courses-*.json',
  format = 'JSON',
  overwrite = true
) AS
SELECT * FROM `${project}.${dataset}.stats_most_waitlisted_courses_latest`;

EXPORT DATA OPTIONS (
  uri = 'gs://${output_bucket}/stats/most_waitlisted_sections/most-waitlisted-sections-*.json',
  format = 'JSON',
  overwrite = true
) AS
SELECT * FROM `${project}.${dataset}.stats_most_waitlisted_sections_latest`;
