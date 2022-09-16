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

module "scraper-launcher-function" {
  source               = "./modules/function"
  project              = var.project
  region               = var.region
  function_name        = "waitlist-scraper-launcher"
  source_dir           = abspath("../scraper")
  function_entry_point = "launcher"
  runtime              = "nodejs16"
  available_memory_mb  = 256
  pubsub_name          = google_pubsub_topic.scrape-launcher-topic.name
  env_vars             = {}
  max-instances        = 5
}

module "notifier-function" {
  source               = "./modules/function"
  project              = var.project
  region               = var.region
  function_name        = "notifier"
  source_dir           = abspath("../notifier")
  function_entry_point = "notifier"
  runtime              = "nodejs16"
  available_memory_mb  = 128
  pubsub_name          = google_pubsub_topic.prefix-update-topic.name
  env_vars             = {
    VAPID_PRIV_KEY        = var.NOTIFIER_VAPID_PRIV_KEY
    DISCORD_CLIENT_SECRET = var.DISCORD_CLIENT_SECRET
  }
  max-instances = 100
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
