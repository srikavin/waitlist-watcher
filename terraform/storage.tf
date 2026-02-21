resource "google_storage_bucket" "historical_bucket" {
  name     = "${var.project}-historical-data"
  location = var.region

  cors {
    origin          = ["*"]
    method          = ["HEAD", "GET"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  uniform_bucket_level_access = true
}

resource "google_storage_bucket_acl" "historical_bucket_public_read" {
  bucket = google_storage_bucket.historical_bucket.name

  predefined_acl = "publicRead"
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
