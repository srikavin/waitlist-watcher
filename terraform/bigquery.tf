resource "google_pubsub_topic" "event-ingest-topic" {
  name = "events-ingest"
}

resource "google_pubsub_topic" "snapshot-ingest-topic" {
  name = "snapshots-ingest"
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
  deletion_protection = true
  schema              = file("${path.module}/schemas/events_pubsub.json")

  time_partitioning {
    type  = "DAY"
    field = "timestamp"
  }

  clustering = ["semester", "department", "course", "section"]
}

resource "google_bigquery_table" "snapshots" {
  dataset_id          = google_bigquery_dataset.waitlist.dataset_id
  table_id            = "snapshots"
  deletion_protection = true
  schema              = file("${path.module}/schemas/snapshots_pubsub.json")

  time_partitioning {
    type  = "DAY"
    field = "timestamp"
  }

  clustering = ["semester", "department", "course", "section"]
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

resource "google_pubsub_subscription" "snapshots-bigquery-subscription" {
  name  = "snapshots-ingest-to-bigquery"
  topic = google_pubsub_topic.snapshot-ingest-topic.id

  bigquery_config {
    table               = "${var.project}:${google_bigquery_table.snapshots.dataset_id}.${google_bigquery_table.snapshots.table_id}"
    use_table_schema    = true
    write_metadata      = false
    drop_unknown_fields = true
  }

  depends_on = [
    google_bigquery_table.snapshots,
    google_bigquery_dataset_iam_member.pubsub_bigquery_editor,
    google_bigquery_dataset_iam_member.pubsub_bigquery_metadata_viewer,
  ]
}
