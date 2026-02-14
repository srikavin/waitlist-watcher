CREATE TEMP TABLE dedup_events AS
SELECT * EXCEPT(rn)
FROM (
  SELECT
    event_id,
    timestamp,
    semester,
    department,
    course,
    section,
    type,
    old_value,
    new_value,
    scrape_published_at,
    ROW_NUMBER() OVER (
      PARTITION BY event_id, semester, course, section
      ORDER BY scrape_published_at DESC
    ) AS rn
  FROM `${project}.${dataset}.${events_table}`
  WHERE timestamp IS NOT NULL
    AND semester IS NOT NULL
)
WHERE rn = 1;

CREATE OR REPLACE TABLE `${project}.${dataset}.stats_overview_latest`
AS
SELECT
  CURRENT_TIMESTAMP() AS generated_at,
  semester,
  COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)) AS events_24h,
  COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)) AS events_7d,
  COUNT(DISTINCT IF(
    timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR),
    FORMAT('%s|%s|%s|%s', semester, department, course, section),
    NULL
  )) AS active_sections_24h,
  COUNTIF(
    timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    AND type = 'open_seat_available'
  ) AS open_seat_alerts_24h,
  COUNTIF(
    timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    AND type = 'waitlist_changed'
    AND SAFE_CAST(new_value AS INT64) < SAFE_CAST(old_value AS INT64)
  ) AS waitlist_drops_24h,
  COUNT(DISTINCT IF(
    timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR),
    department,
    NULL
  )) AS active_departments_24h
FROM dedup_events
GROUP BY semester
ORDER BY semester DESC
LIMIT 24;

CREATE OR REPLACE TABLE `${project}.${dataset}.stats_top_courses_latest`
AS
WITH periodized AS (
  SELECT '24h' AS period, * FROM dedup_events
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    AND department IS NOT NULL
    AND course IS NOT NULL
  UNION ALL
  SELECT '7d' AS period, * FROM dedup_events
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND department IS NOT NULL
    AND course IS NOT NULL
  UNION ALL
  SELECT 'semester' AS period, * FROM dedup_events
  WHERE department IS NOT NULL
    AND course IS NOT NULL
)
SELECT
  semester,
  period,
  department,
  course,
  COUNT(*) AS events,
  COUNTIF(type = 'open_seat_available') AS open_seat_alerts,
  SUM(CASE WHEN type = 'open_seats_changed' THEN ABS(IFNULL(SAFE_CAST(new_value AS INT64), 0) - IFNULL(SAFE_CAST(old_value AS INT64), 0)) ELSE 0 END) AS seat_churn,
  SUM(CASE WHEN type = 'waitlist_changed' THEN ABS(IFNULL(SAFE_CAST(new_value AS INT64), 0) - IFNULL(SAFE_CAST(old_value AS INT64), 0)) ELSE 0 END) AS waitlist_churn
FROM periodized
GROUP BY semester, period, department, course
QUALIFY ROW_NUMBER() OVER (PARTITION BY semester, period ORDER BY events DESC, seat_churn DESC) <= 120;

CREATE OR REPLACE TABLE `${project}.${dataset}.stats_fastest_filling_sections_latest`
AS
WITH periodized AS (
  SELECT '24h' AS period, * FROM dedup_events
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
    AND department IS NOT NULL
    AND course IS NOT NULL
    AND section IS NOT NULL
  UNION ALL
  SELECT '7d' AS period, * FROM dedup_events
  WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND department IS NOT NULL
    AND course IS NOT NULL
    AND section IS NOT NULL
  UNION ALL
  SELECT 'semester' AS period, * FROM dedup_events
  WHERE department IS NOT NULL
    AND course IS NOT NULL
    AND section IS NOT NULL
)
SELECT
  semester,
  period,
  department,
  course,
  section,
  COUNT(*) AS events,
  SUM(
    CASE
      WHEN type = 'open_seats_changed'
        THEN GREATEST(IFNULL(SAFE_CAST(old_value AS INT64), 0) - IFNULL(SAFE_CAST(new_value AS INT64), 0), 0)
      ELSE 0
    END
  ) AS seats_filled,
  SUM(
    CASE
      WHEN type = 'open_seats_changed'
        THEN ABS(IFNULL(SAFE_CAST(new_value AS INT64), 0) - IFNULL(SAFE_CAST(old_value AS INT64), 0))
      ELSE 0
    END
  ) AS seat_churn
FROM periodized
GROUP BY semester, period, department, course, section
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY semester, period
  ORDER BY seats_filled DESC, seat_churn DESC, events DESC
) <= 200;

CREATE OR REPLACE TABLE `${project}.${dataset}.stats_quickest_filled_sections_latest`
AS
WITH section_timings AS (
  SELECT
    semester,
    department,
    course,
    section,
    MIN(timestamp) AS first_event_ts,
    MIN(
      IF(
        type = 'open_seats_changed'
        AND IFNULL(SAFE_CAST(old_value AS INT64), 0) > 0
        AND IFNULL(SAFE_CAST(new_value AS INT64), 0) = 0,
        timestamp,
        NULL
      )
    ) AS first_zero_open_ts,
    COUNT(*) AS events
  FROM dedup_events
  WHERE department IS NOT NULL
    AND course IS NOT NULL
    AND section IS NOT NULL
  GROUP BY semester, department, course, section
)
SELECT
  semester,
  department,
  course,
  section,
  events,
  TIMESTAMP_DIFF(first_zero_open_ts, first_event_ts, MINUTE) AS quickest_minutes
FROM section_timings
WHERE first_zero_open_ts IS NOT NULL
  AND first_zero_open_ts >= first_event_ts
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY semester
  ORDER BY quickest_minutes ASC, events DESC
) <= 200;

EXPORT DATA OPTIONS (
  uri = 'gs://${output_bucket}/stats/overview/overview-*.json',
  format = 'JSON',
  overwrite = true
) AS
SELECT * FROM `${project}.${dataset}.stats_overview_latest`;

EXPORT DATA OPTIONS (
  uri = 'gs://${output_bucket}/stats/top_courses/top-courses-*.json',
  format = 'JSON',
  overwrite = true
) AS
SELECT * FROM `${project}.${dataset}.stats_top_courses_latest`;

EXPORT DATA OPTIONS (
  uri = 'gs://${output_bucket}/stats/fastest_filling_sections/fastest-filling-sections-*.json',
  format = 'JSON',
  overwrite = true
) AS
SELECT * FROM `${project}.${dataset}.stats_fastest_filling_sections_latest`;

EXPORT DATA OPTIONS (
  uri = 'gs://${output_bucket}/stats/quickest_filled_sections/quickest-filled-sections-*.json',
  format = 'JSON',
  overwrite = true
) AS
SELECT * FROM `${project}.${dataset}.stats_quickest_filled_sections_latest`;
