provider "google" {
  project = var.project
  region  = var.region
}

module "my_function" {
  source               = "./modules/function"
  project              = var.project
  region               = var.region
  function_name        = "waitlist-scraper"
  source_dir           = abspath("../app")
  function_entry_point = "app"
  runtime              = "nodejs16"
}

module "appengine" {
  source     = "./modules/appengine"
  project    = var.project
  region     = var.region
  name       = "web-app"
  source_dir = abspath("../web")
  runtime    = "nodejs16"
}