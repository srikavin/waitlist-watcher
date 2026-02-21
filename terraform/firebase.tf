resource "google_firestore_database" "default" {
  provider    = google-beta
  project     = var.project
  name        = "(default)"
  location_id = "us-east4"
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.enabled_apis]
}

resource "google_firebase_database_instance" "default" {
  provider = google-beta
  project  = var.project
  region   = "us-central1"

  instance_id = "${var.project}-default-rtdb"
  type        = "DEFAULT_DATABASE"

  depends_on = [google_project_service.enabled_apis]
}

resource "google_firebase_database_instance" "live_stream" {
  provider = google-beta
  project  = var.project
  region   = "us-central1"

  instance_id = "waitlist-watcher-live-events"
  type        = "USER_DATABASE"

  depends_on = [google_project_service.enabled_apis]
}
