provider "google" {
  project = var.project
  region  = var.region
}

module "my_function" {
  project              = var.project
  region               = var.region
  source               = "./modules/function"
  function_name        = "my-function"
  function_entry_point = "app"
  source_dir = abspath("../app")
}