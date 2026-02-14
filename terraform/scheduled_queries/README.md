# Scheduled Query Management

Scheduled queries are versioned in this folder as SQL files and deployed by Terraform.

- Edit SQL in this directory.
- `terraform/main.tf` auto-discovers all `*.sql` files in this folder.
- Apply Terraform to roll out query changes.
- Schedules are configured in Terraform per query key.

Current queries:
- `export_stats_events_bundle.sql`: single dedup scan of `events` that materializes + exports:
  - overview
  - top courses
  - fastest filling sections
  - quickest filled sections
- `export_stats_snapshots_bundle.sql`: single latest-section scan of `snapshots` that materializes + exports:
  - most waitlisted courses
  - most waitlisted sections

Output caps:
- Overview: max 24 semesters.
- Fastest filling sections: top 200 sections per semester/period.
- Quickest filled sections: top 200 sections per semester.
- Top courses: top 120 courses per semester/period.
- Most waitlisted courses: top 120 courses per semester.
- Most waitlisted sections: top 20,000 sections per semester.

Schedules:
- `export_stats_events_bundle`: every 10 minutes
- `export_stats_snapshots_bundle`: every 30 minutes
