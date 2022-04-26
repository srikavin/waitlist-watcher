terraform {
  cloud {
    organization = "srikavin"

    workspaces {
      tags = ["waitlist-watcher"]
    }
  }
}
