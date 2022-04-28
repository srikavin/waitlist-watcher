provider "google" {
  project = var.project
  region  = var.region
}

resource "google_pubsub_topic" "scrape-topic" {
  name = "scrape-prefix"
}

resource "google_pubsub_topic" "scrape-launcher-topic" {
  name = "scrape-launcher"
}

resource "google_cloud_scheduler_job" "job" {
  name        = "scraper-launcher-job"
  description = "Cycles through course prefixes to scrape"
  schedule    = "*/1 * * * *"

  pubsub_target {
    # topic.id is the topic's full resource name.
    topic_name = google_pubsub_topic.scrape-launcher-topic.id
    data = base64encode("--")
  }
}

module "scraper-function" {
  source               = "./modules/function"
  project              = var.project
  region               = var.region
  function_name        = "waitlist-scraper"
  source_dir           = abspath("../scraper")
  function_entry_point = "scraper"
  runtime              = "nodejs16"
  pubsub_name          = google_pubsub_topic.scrape-topic.name
}

module "scraper-launcher-function" {
  source               = "./modules/function"
  project              = var.project
  region               = var.region
  function_name        = "waitlist-scraper-launcher"
  source_dir           = abspath("../scraper")
  function_entry_point = "triggerer"
  runtime              = "nodejs16"
  pubsub_name          = google_pubsub_topic.scrape-launcher-topic.name
}

module "appengine" {
  source     = "./modules/appengine"
  project    = var.project
  region     = var.region
  name       = "web-app"
  source_dir = abspath("../web")
  runtime    = "nodejs16"
}