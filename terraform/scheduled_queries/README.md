# Scheduled Query Management

Scheduled queries are versioned in this folder as SQL files and deployed by Terraform.

- Edit SQL in this directory.
- `terraform/main.tf` auto-discovers all `*.sql` files in this folder.
- Apply Terraform to roll out query changes.
- Each discovered scheduled query runs `every 10 minutes`.

Current queries:
- `section_daily_stats.sql`: builds a daily section-level analytics table.
- `export_daily_section_leaderboard.sql`: exports daily leaderboard JSON files to the scheduled query output bucket.
- `snapshots_latest_by_department.sql`: latest timestamp and section counts per semester/department.
- `snapshots_latest_sections.sql`: latest section-level state per semester/department/course/section.
