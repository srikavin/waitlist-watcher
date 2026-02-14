terraform {
  required_version = ">= 1.11.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.19"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.19"
    }
  }
}

