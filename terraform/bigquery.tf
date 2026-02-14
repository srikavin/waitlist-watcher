locals {
  scheduled_query_sa_name = "bq-scheduled-query-runner"
  scheduled_query_files   = fileset("${path.module}/scheduled_queries", "*.sql")
  scheduled_queries = {
    for f in local.scheduled_query_files :
    trimsuffix(f, ".sql") => {
      query = templatefile("${path.module}/scheduled_queries/${f}", {
        project       = var.project
        dataset       = google_bigquery_dataset.waitlist.dataset_id
        events_table  = google_bigquery_table.events.table_id
        output_bucket = google_storage_bucket.scheduled_query_outputs.name
      })
    }
  }
}

resource "google_pubsub_topic" "event-ingest-topic" {
  name = "events-ingest"
}

resource "google_project_service_identity" "pubsub_service_agent" {
  provider = google-beta
  project  = var.project
  service  = "pubsub.googleapis.com"

  depends_on = [google_project_service.enabled_apis]
}

resource "google_project_service_identity" "bigquery_data_transfer_service_agent" {
  provider = google-beta
  project  = var.project
  service  = "bigquerydatatransfer.googleapis.com"

  depends_on = [google_project_service.enabled_apis]
}

resource "google_bigquery_dataset" "waitlist" {
  dataset_id                 = var.bigquery_dataset
  location                   = var.bigquery_location
  delete_contents_on_destroy = false

  depends_on = [google_project_service.enabled_apis]
}

resource "google_bigquery_table" "events" {
  dataset_id          = google_bigquery_dataset.waitlist.dataset_id
  table_id            = "events"
  deletion_protection = false
  schema              = file("${path.module}/schemas/events_pubsub.json")
}

resource "google_bigquery_dataset_iam_member" "pubsub_bigquery_editor" {
  dataset_id = google_bigquery_dataset.waitlist.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_project_service_identity.pubsub_service_agent.email}"
}

resource "google_bigquery_dataset_iam_member" "pubsub_bigquery_metadata_viewer" {
  dataset_id = google_bigquery_dataset.waitlist.dataset_id
  role       = "roles/bigquery.metadataViewer"
  member     = "serviceAccount:${google_project_service_identity.pubsub_service_agent.email}"
}

resource "google_pubsub_subscription" "events-bigquery-subscription" {
  name  = "events-ingest-to-bigquery"
  topic = google_pubsub_topic.event-ingest-topic.id

  bigquery_config {
    table               = "${var.project}:${google_bigquery_table.events.dataset_id}.${google_bigquery_table.events.table_id}"
    use_table_schema    = true
    write_metadata      = false
    drop_unknown_fields = true
  }

  depends_on = [
    google_bigquery_table.events,
    google_bigquery_dataset_iam_member.pubsub_bigquery_editor,
    google_bigquery_dataset_iam_member.pubsub_bigquery_metadata_viewer,
  ]
}

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

resource "google_bigquery_data_transfer_config" "scheduled_queries" {
  for_each = local.scheduled_queries

  display_name         = each.key
  location             = var.bigquery_location
  data_source_id       = "scheduled_query"
  schedule             = "every 10 minutes"
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
