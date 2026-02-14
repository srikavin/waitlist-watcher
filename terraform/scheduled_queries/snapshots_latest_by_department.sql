CREATE OR REPLACE TABLE `${project}.${dataset}.snapshots_latest_by_department`
AS
SELECT
  semester,
  department,
  MAX(timestamp) AS latest_timestamp,
  COUNT(*) AS section_count
FROM `${project}.${dataset}.${snapshots_table}`
GROUP BY semester, department;
