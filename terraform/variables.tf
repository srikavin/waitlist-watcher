variable "project" {
  default = "waitlist-watcher"
}
variable "region" {
  default = "us-east4"
}

variable "bigquery_location" {
  default = "US"
}

variable "bigquery_dataset" {
  default = "waitlist_watcher_course_data"
}

variable "stats_semesters" {
  type = list(string)
  default = [
    "202208",
    "202301",
    "202308",
    "202401",
    "202408",
    "202501",
    "202508",
    "202601",
    "202608",
  ]
}

variable "NOTIFIER_VAPID_PRIV_KEY" {}

variable "GOOGLE_CREDENTIALS" {}

variable "DISCORD_CLIENT_SECRET" {}

variable "STRIPE_API_KEY" {}

variable "STRIPE_SIGNING_SECRET" {}

variable "EMAIL_SECRET" {}
