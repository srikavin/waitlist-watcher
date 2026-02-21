resource "google_storage_bucket" "scheduled_query_outputs" {
  name          = "${var.project}-scheduled-query-outputs"
  location      = var.bigquery_location
  force_destroy = false

  cors {
    origin          = ["*"]
    method          = ["HEAD", "GET"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  uniform_bucket_level_access = true
}

resource "google_service_account" "scheduled_query_runner" {
  account_id   = local.scheduled_query_sa_name
  display_name = "BigQuery Scheduled Query Runner"
}

resource "google_service_account_iam_member" "dts_sa_user" {
  service_account_id = google_service_account.scheduled_query_runner.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_project_service_identity.bigquery_data_transfer_service_agent.email}"
}

resource "google_project_iam_member" "scheduled_query_job_user" {
  project = var.project
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.scheduled_query_runner.email}"
}

resource "google_project_iam_member" "scheduled_query_data_editor" {
  project = var.project
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.scheduled_query_runner.email}"
}

resource "google_project_iam_member" "scheduled_query_data_viewer" {
  project = var.project
  role    = "roles/bigquery.dataViewer"
  member  = "serviceAccount:${google_service_account.scheduled_query_runner.email}"
}

resource "google_storage_bucket_iam_member" "scheduled_query_output_writer" {
  bucket = google_storage_bucket.scheduled_query_outputs.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.scheduled_query_runner.email}"
}

resource "google_storage_bucket_iam_member" "scheduled_query_output_public_read" {
  bucket = google_storage_bucket.scheduled_query_outputs.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

locals {
  scheduled_query_sa_name    = "bq-scheduled-query-runner"
  scheduled_query_files      = fileset("${path.module}/scheduled_queries", "*.sql")
  business_hours_schedule    = "every 30 minutes from 11:00 to 04:30 on mon,tue,wed,thu,fri"
  historical_weekly_schedule = "every sunday 08:00"
  app_config                 = jsondecode(file("${path.module}/../common/config.json"))
  stats_semesters            = sort([for semester in local.app_config.semesters.semesters : tostring(semester.id)])
  latest_stats_semester      = local.stats_semesters[length(local.stats_semesters) - 1]
  scheduled_query_definitions = flatten([
    for f in local.scheduled_query_files : [
      for semester in local.stats_semesters : {
        base_name = trimsuffix(f, ".sql")
        key       = "${trimsuffix(f, ".sql")}_${semester}"
        semester  = semester
        query = templatefile("${path.module}/scheduled_queries/${f}", {
          project         = var.project
          dataset         = google_bigquery_dataset.waitlist.dataset_id
          events_table    = google_bigquery_table.events.table_id
          snapshots_table = google_bigquery_table.snapshots.table_id
          output_bucket   = google_storage_bucket.scheduled_query_outputs.name
          semester        = semester
        })
        schedule = semester == local.latest_stats_semester ? local.business_hours_schedule : local.historical_weekly_schedule
      }
    ]
  ])
  scheduled_queries = {
    for cfg in local.scheduled_query_definitions :
    cfg.key => cfg
  }
}

resource "google_bigquery_data_transfer_config" "scheduled_queries" {
  for_each = local.scheduled_queries

  display_name         = "${each.value.base_name}-${each.value.semester}"
  location             = var.bigquery_location
  data_source_id       = "scheduled_query"
  schedule             = each.value.schedule
  service_account_name = google_service_account.scheduled_query_runner.email

  params = {
    query = each.value.query
  }

  depends_on = [
    google_project_service.enabled_apis,
    google_project_iam_member.scheduled_query_job_user,
    google_project_iam_member.scheduled_query_data_editor,
    google_project_iam_member.scheduled_query_data_viewer,
    google_service_account_iam_member.dts_sa_user,
  ]
}
