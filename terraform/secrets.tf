resource "google_secret_manager_secret" "discord-client-secret" {
  secret_id = "DISCORD_CLIENT_SECRET"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "discord-client-secret" {
  secret = google_secret_manager_secret.discord-client-secret.id

  secret_data = var.DISCORD_CLIENT_SECRET
}

resource "google_secret_manager_secret_iam_member" "discord-client-secret-appengine-accessor" {
  secret_id = google_secret_manager_secret.discord-client-secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.project}@appspot.gserviceaccount.com"
}

resource "google_secret_manager_secret" "email-secret" {
  secret_id = "EMAIL_SECRET"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "email-secret" {
  secret = google_secret_manager_secret.email-secret.id

  secret_data = var.EMAIL_SECRET
}

resource "google_secret_manager_secret" "notifier-vapid-priv-key" {
  secret_id = "VAPID_PRIV_KEY"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "notifier-vapid-priv-key" {
  secret = google_secret_manager_secret.notifier-vapid-priv-key.id

  secret_data = var.NOTIFIER_VAPID_PRIV_KEY
}
