provider "google" {
  project = var.project
  region  = var.region
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
    # topic.id is the topic's full resource name.
    topic_name = google_pubsub_topic.scrape-launcher-topic.id
    data       = base64encode("--")
  }
}

resource "google_storage_bucket" "historical_bucket" {
  name     = "${var.project}-historical-data"
  location = var.region
}

resource "google_project_iam_custom_role" "historical-data-reader" {
  role_id     = "historicalDataReader"
  title       = "Historical Data Reader"
  permissions = ["storage.objects.get"]
}

resource "google_storage_bucket_iam_binding" "historical-data-policy" {
  bucket  = google_storage_bucket.historical_bucket.name
  role    = google_project_iam_custom_role.historical-data-reader.id
  members = ["allUsers"]
}

resource "google_secret_manager_secret" "discord-client-secret" {
  secret_id = "DISCORD_CLIENT_SECRET"

  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "discord-client-secret" {
  secret = google_secret_manager_secret.discord-client-secret.id

  secret_data = var.DISCORD_CLIENT_SECRET
}

resource "google_secret_manager_secret" "sendgrid-api-key" {
  secret_id = "SENDGRID_API_KEY"

  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "sendgrid-api-key" {
  secret = google_secret_manager_secret.sendgrid-api-key.id

  secret_data = var.SENDGRID_API_KEY
}

resource "google_secret_manager_secret" "notifier-vapid-priv-key" {
  secret_id = "VAPID_PRIV_KEY"

  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "notifier-vapid-priv-key" {
  secret = google_secret_manager_secret.notifier-vapid-priv-key.id

  secret_data = var.NOTIFIER_VAPID_PRIV_KEY
}

module "appengine" {
  source     = "./modules/appengine"
  project    = var.project
  region     = var.region
  name       = "web-app"
  source_dir = abspath("../web")
  runtime    = "nodejs16"
  env_vars   = {
    DISCORD_CLIENT_SECRET = var.DISCORD_CLIENT_SECRET
  }
}

resource "google_cloud_tasks_queue" "advanced_configuration" {
  count = 10

  name     = "discord-webhook-queue-shard-${count.index}"
  location = var.region

  rate_limits {
    max_concurrent_dispatches = 1
    max_dispatches_per_second = 1
  }

  retry_config {
    max_attempts       = 4
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
    max_concurrent_dispatches = 5
    max_dispatches_per_second = 2
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
