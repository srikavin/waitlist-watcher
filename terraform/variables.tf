variable "project" {
  default = "waitlist-watcher"
}
variable "region" {
  default = "us-east4"
}

variable "NOTIFIER_VAPID_PRIV_KEY" {}

variable "GOOGLE_CREDENTIALS" {}

variable "DISCORD_CLIENT_SECRET" {}

variable "STRIPE_API_KEY" {}

variable "STRIPE_SIGNING_SECRET" {}

variable "EMAIL_SECRET" {}