provider "google" {
  project = var.project
  region  = var.region
}

resource "google_pubsub_topic" "scrape-topic" {
  name = "scrape-prefix"
}

resource "google_cloud_scheduler_job" "job" {
  name        = "cmsc-scraper-job"
  description = "CMSC scraper"
  schedule    = "*/10 * * * *"

  pubsub_target {
    # topic.id is the topic's full resource name.
    topic_name = google_pubsub_topic.scrape-topic.id
    data       = base64encode("CMSC")
  }
}

module "scraper-function" {
  source               = "./modules/function"
  project              = var.project
  region               = var.region
  function_name        = "waitlist-scraper"
  source_dir           = abspath("../scraper")
  function_entry_point = "app"
  runtime              = "nodejs16"
  pubsub_name          = google_pubsub_topic.scrape-topic.name
}

module "appengine" {
  source     = "./modules/appengine"
  project    = var.project
  region     = var.region
  name       = "web-app"
  source_dir = abspath("../web")
  runtime    = "nodejs16"
}