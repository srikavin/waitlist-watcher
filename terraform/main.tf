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
  schedule    = "*/1 0-5,11-23 * * *"

  pubsub_target {
    # topic.id is the topic's full resource name.
    topic_name = google_pubsub_topic.scrape-launcher-topic.id
    data       = base64encode("--")
  }
}

module "scraper-launcher-function" {
  source               = "./modules/function"
  project              = var.project
  region               = var.region
  function_name        = "waitlist-scraper-launcher"
  source_dir           = abspath("../scraper")
  function_entry_point = "launcher"
  runtime              = "nodejs16"
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
  pubsub_name          = google_pubsub_topic.prefix-update-topic.name
  env_vars             = {
    VAPID_PRIV_KEY = var.NOTIFIER_VAPID_PRIV_KEY
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
}