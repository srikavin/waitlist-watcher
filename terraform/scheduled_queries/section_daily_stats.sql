CREATE OR REPLACE TABLE `${project}.${dataset}.section_daily_stats`
PARTITION BY day
AS
WITH dedup AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY event_id, semester, course, section
        ORDER BY scrape_published_at DESC
      ) AS rn
    FROM `${project}.${dataset}.${events_table}`
    WHERE timestamp IS NOT NULL
      AND section IS NOT NULL
  )
  WHERE rn = 1
)
SELECT
  DATE(timestamp) AS day,
  semester,
  department,
  course,
  section,
  COUNT(*) AS event_count,
  COUNTIF(type = 'open_seat_available') AS open_seat_available_count,
  COUNTIF(type = 'instructor_changed') AS instructor_changed_count,
  COUNTIF(type = 'meeting_times_changed') AS meeting_times_changed_count,
  SUM(
    CASE
      WHEN type = 'open_seats_changed' THEN ABS(SAFE_CAST(new_value AS INT64) - SAFE_CAST(old_value AS INT64))
      ELSE 0
    END
  ) AS open_seat_churn,
  SUM(
    CASE
      WHEN type = 'waitlist_changed' THEN GREATEST(SAFE_CAST(new_value AS INT64) - SAFE_CAST(old_value AS INT64), 0)
      ELSE 0
    END
  ) AS waitlist_increase_total
FROM dedup
GROUP BY day, semester, department, course, section;
