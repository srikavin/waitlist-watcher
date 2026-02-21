provider "google" {
  project = var.project
  region  = var.region
}

provider "google-beta" {
  project = var.project
  region  = var.region
}

resource "google_project_service" "enabled_apis" {
  for_each = toset([
    "appengine.googleapis.com",
    "bigquery.googleapis.com",
    "bigquerydatatransfer.googleapis.com",
    "firestore.googleapis.com",
    "firebase.googleapis.com",
    "firebasedatabase.googleapis.com",
    "pubsub.googleapis.com",
    "storage.googleapis.com",
  ])

  project = var.project
  service = each.key

  disable_on_destroy = false
}

resource "google_app_engine_application" "app" {
  project       = var.project
  location_id   = var.region
  database_type = "CLOUD_FIRESTORE"

  depends_on = [google_project_service.enabled_apis]
}

resource "google_pubsub_topic" "scrape-launcher-topic" {
  name = "scrape-launcher"
}

resource "google_pubsub_topic" "prefix-update-topic" {
  name = "prefix-update"
}

resource "google_cloud_scheduler_job" "job" {
  name        = "scraper-launcher-job"
  description = "Cycles through course prefixes to scrape"
  schedule    = "*/5 0-5,11-23 * * *"

  pubsub_target {
    topic_name = google_pubsub_topic.scrape-launcher-topic.id
    data       = base64encode("--")
  }
}

resource "google_cloud_tasks_queue" "advanced_configuration" {
  count = 10

  name     = "discord-webhook-queue-shard-${count.index}"
  location = var.region

  rate_limits {
    max_concurrent_dispatches = 1
    max_dispatches_per_second = 0.2
  }

  retry_config {
    max_attempts       = 3
    max_retry_duration = "1000s"
    max_backoff        = "3600s"
    min_backoff        = "15s"
    max_doublings      = 16
  }

  stackdriver_logging_config {
    sampling_ratio = 0.1
  }
}

resource "google_cloud_tasks_queue" "webhook-queue" {
  count = 5

  name     = "webhook-queue-shard-${count.index}"
  location = var.region

  rate_limits {
    max_concurrent_dispatches = 2
    max_dispatches_per_second = 0.5
  }

  retry_config {
    max_attempts       = 2
    max_retry_duration = "1000s"
    max_backoff        = "3600s"
    min_backoff        = "30s"
    max_doublings      = 16
  }

  stackdriver_logging_config {
    sampling_ratio = 0.1
  }
}
