output "historical_bucket_name" {
  value = google_storage_bucket.historical_bucket.name
}

output "scheduled_query_outputs_bucket_name" {
  value = google_storage_bucket.scheduled_query_outputs.name
}

output "events_ingest_topic" {
  value = google_pubsub_topic.event-ingest-topic.name
}

output "events_ingest_bigquery_subscription" {
  value = google_pubsub_subscription.events-bigquery-subscription.name
}

output "bigquery_dataset_id" {
  value = google_bigquery_dataset.waitlist.dataset_id
}

output "bigquery_events_table_id" {
  value = google_bigquery_table.events.table_id
}

output "scheduled_query_transfer_ids" {
  value = { for k, v in google_bigquery_data_transfer_config.scheduled_queries : k => v.id }
}
