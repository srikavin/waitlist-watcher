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
    "cloudscheduler.googleapis.com",
    "run.googleapis.com",
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

resource "google_service_account" "scraper_scheduler" {
  account_id   = "scraper-scheduler"
  display_name = "Scraper Scheduler"
}

data "google_project" "current" {
  project_id = var.project
}

locals {
  scraper_http_host = "scraperhttp-${data.google_project.current.number}.us-east1.run.app"
  scraper_http_uri  = "https://${local.scraper_http_host}"
}

resource "google_pubsub_topic" "prefix-update-topic" {
  name = "prefix-update"
}

resource "google_cloud_scheduler_job" "job" {
  name        = "scraper-launcher-job"
  description = "Cycles through course prefixes to scrape"
  schedule    = "*/5 0-5,11-23 * * *"

  attempt_deadline = "320s"
  time_zone        = "Etc/UTC"

  retry_config {
    retry_count        = 0
    max_retry_duration = "0s"
  }

  http_target {
    uri         = local.scraper_http_uri
    http_method = "POST"

    oidc_token {
      service_account_email = google_service_account.scraper_scheduler.email
      audience              = local.scraper_http_uri
    }
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
