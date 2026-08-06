CREATE DATABASE IF NOT EXISTS digital_twin;
CREATE TABLE IF NOT EXISTS digital_twin.document_chunks (
  project_id String, artifact_uri String, logical_uri String, revision_hash String,
  source_path String, section_uri String, page UInt32, text String,
  source_kind LowCardinality(String), derived Bool, derived_from Array(String), created_at DateTime64(3)
) ENGINE = ReplacingMergeTree(created_at) ORDER BY (project_id, artifact_uri, section_uri, page);
