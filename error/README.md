# Runtime error catalog

`catalog.json` is the semantic source of truth. The Markdown pages are
deterministic projections enriched with source locations discovered by
`scripts/error-catalog.mjs`. Do not edit generated pages directly.

| Code | Subsystem | Class | Retryable |
| --- | --- | --- | --- |
| [ARCHIVE_CAD_BACKEND_MISSING](./ARCHIVE_CAD_BACKEND_MISSING.md) | archive | configuration | false |
| [ARCHIVE_ENTRY_LIMIT](./ARCHIVE_ENTRY_LIMIT.md) | archive | state | true |
| [ARCHIVE_FILE_LIMIT](./ARCHIVE_FILE_LIMIT.md) | archive | state | true |
| [ARCHIVE_GEOMETRY_SELECTION_LIMIT](./ARCHIVE_GEOMETRY_SELECTION_LIMIT.md) | archive | state | true |
| [ARCHIVE_INVENTORY_LIMIT](./ARCHIVE_INVENTORY_LIMIT.md) | archive | state | true |
| [ARCHIVE_MODE_INVALID](./ARCHIVE_MODE_INVALID.md) | archive | configuration | false |
| [ARCHIVE_TEXT_SELECTION_LIMIT](./ARCHIVE_TEXT_SELECTION_LIMIT.md) | archive | state | true |
| [ARCHIVE_TOTAL_LIMIT](./ARCHIVE_TOTAL_LIMIT.md) | archive | state | true |
| [ARCHIVE_UNSAFE_PATH](./ARCHIVE_UNSAFE_PATH.md) | archive | policy | false |
| [ASSEMBLIES_HEADER_REQUIRED](./ASSEMBLIES_HEADER_REQUIRED.md) | assemblies | configuration | false |
| [ASSEMBLY_BOOL_INVALID](./ASSEMBLY_BOOL_INVALID.md) | assembly | configuration | false |
| [ASSEMBLY_DOCUMENT_INVALID](./ASSEMBLY_DOCUMENT_INVALID.md) | assembly | configuration | false |
| [ASSEMBLY_DOCUMENT_REQUIRED](./ASSEMBLY_DOCUMENT_REQUIRED.md) | assembly | configuration | false |
| [ASSEMBLY_DOCUMENT_UNKNOWN_KEY](./ASSEMBLY_DOCUMENT_UNKNOWN_KEY.md) | assembly | configuration | false |
| [ASSEMBLY_END_INVALID](./ASSEMBLY_END_INVALID.md) | assembly | configuration | false |
| [ASSEMBLY_END_REQUIRED](./ASSEMBLY_END_REQUIRED.md) | assembly | configuration | false |
| [ASSEMBLY_INVALID](./ASSEMBLY_INVALID.md) | assembly | configuration | false |
| [ASSEMBLY_KEY_VALUE_REQUIRED](./ASSEMBLY_KEY_VALUE_REQUIRED.md) | assembly | configuration | false |
| [ASSEMBLY_LINE_OUTSIDE](./ASSEMBLY_LINE_OUTSIDE.md) | assembly | state | false |
| [ASSEMBLY_PART_CONTEXT_INVALID](./ASSEMBLY_PART_CONTEXT_INVALID.md) | assembly | configuration | false |
| [ASSEMBLY_PART_HEADER_INVALID](./ASSEMBLY_PART_HEADER_INVALID.md) | assembly | configuration | false |
| [ASSEMBLY_PART_INVALID](./ASSEMBLY_PART_INVALID.md) | assembly | configuration | false |
| [ASSEMBLY_PART_NOT_STARTED](./ASSEMBLY_PART_NOT_STARTED.md) | assembly | state | false |
| [ASSEMBLY_PART_UNKNOWN_KEY](./ASSEMBLY_PART_UNKNOWN_KEY.md) | assembly | configuration | false |
| [ASSEMBLY_UNKNOWN_KEY](./ASSEMBLY_UNKNOWN_KEY.md) | assembly | configuration | false |
| [ASSET_NOT_GROUNDED](./ASSET_NOT_GROUNDED.md) | asset | integrity | false |
| [BAD_BIOFOUNDRY_CONFIG](./BAD_BIOFOUNDRY_CONFIG.md) | bad | configuration | false |
| [BAD_EQ](./BAD_EQ.md) | bad | configuration | false |
| [BAD_FILTER](./BAD_FILTER.md) | bad | configuration | false |
| [BAD_GT](./BAD_GT.md) | bad | configuration | false |
| [BAD_GTE](./BAD_GTE.md) | bad | configuration | false |
| [BAD_LT](./BAD_LT.md) | bad | configuration | false |
| [BAD_LTE](./BAD_LTE.md) | bad | configuration | false |
| [BAD_MAX_SITEMAPS](./BAD_MAX_SITEMAPS.md) | bad | configuration | false |
| [BAD_MAX_URLS](./BAD_MAX_URLS.md) | bad | configuration | false |
| [BAD_TWIN_SCHEMA](./BAD_TWIN_SCHEMA.md) | bad | configuration | false |
| [BIOFOUNDRY_REQUIRED_RESOURCE_MISSING](./BIOFOUNDRY_REQUIRED_RESOURCE_MISSING.md) | biofoundry | configuration | false |
| [CAPTURE_DIGEST_MISMATCH](./CAPTURE_DIGEST_MISMATCH.md) | capture | integrity | false |
| [CAPTURE_MISSING](./CAPTURE_MISSING.md) | capture | configuration | false |
| [CAPTURE_UNDECLARED](./CAPTURE_UNDECLARED.md) | capture | state | false |
| [CAPTURES_MISSING](./CAPTURES_MISSING.md) | captures | configuration | false |
| [CLI_ARGUMENTS_REQUIRED](./CLI_ARGUMENTS_REQUIRED.md) | cli | configuration | false |
| [CLICKHOUSE_HTTP](./CLICKHOUSE_HTTP.md) | clickhouse | availability | true |
| [CLICKHOUSE_INVALID_DATETIME](./CLICKHOUSE_INVALID_DATETIME.md) | clickhouse | state | false |
| [CLICKHOUSE_NATIVE_PORT](./CLICKHOUSE_NATIVE_PORT.md) | clickhouse | state | false |
| [COMPONENT_NOT_BOUND_IN_SCENE](./COMPONENT_NOT_BOUND_IN_SCENE.md) | component | state | false |
| [COMPOSE_CLICKHOUSE_CREDENTIAL_MISSING](./COMPOSE_CLICKHOUSE_CREDENTIAL_MISSING.md) | compose | configuration | false |
| [COMPOSE_NETWORK_SUBNET_UNPINNED](./COMPOSE_NETWORK_SUBNET_UNPINNED.md) | compose | state | false |
| [COMPOSE_SECRET_LITERAL](./COMPOSE_SECRET_LITERAL.md) | compose | state | false |
| [COMPOSE_SECRET_LOOKS_LIKE_KEY](./COMPOSE_SECRET_LOOKS_LIKE_KEY.md) | compose | state | false |
| [COMPOSE_SECRET_VARIABLE_MISSING](./COMPOSE_SECRET_VARIABLE_MISSING.md) | compose | configuration | false |
| [COMPOSE_TOKEN_MISSING](./COMPOSE_TOKEN_MISSING.md) | compose | configuration | false |
| [DASHBOARD_ARGUMENTS_REQUIRED](./DASHBOARD_ARGUMENTS_REQUIRED.md) | dashboard | configuration | false |
| [DASHBOARD_ASSETS_NOT_FOUND](./DASHBOARD_ASSETS_NOT_FOUND.md) | dashboard | configuration | false |
| [DASHBOARD_INTERNAL_ERROR](./DASHBOARD_INTERNAL_ERROR.md) | dashboard | state | false |
| [DASHBOARD_PORT_CONFLICT](./DASHBOARD_PORT_CONFLICT.md) | dashboard | state | false |
| [DASHBOARD_PORT_INVALID](./DASHBOARD_PORT_INVALID.md) | dashboard | configuration | false |
| [DASHBOARD_PROJECT_ID_MISSING](./DASHBOARD_PROJECT_ID_MISSING.md) | dashboard | configuration | false |
| [DASHBOARD_READ_ONLY](./DASHBOARD_READ_ONLY.md) | dashboard | policy | false |
| [DASHBOARD_READINESS_TIMEOUT](./DASHBOARD_READINESS_TIMEOUT.md) | dashboard | availability | true |
| [DASHBOARD_REQUEST_FAILED](./DASHBOARD_REQUEST_FAILED.md) | dashboard | availability | true |
| [DETERMINISTIC_VALUE_REQUIRED](./DETERMINISTIC_VALUE_REQUIRED.md) | deterministic | configuration | false |
| [DOCLING_CONVERSION_HTTP](./DOCLING_CONVERSION_HTTP.md) | docling | availability | true |
| [DOCLING_HEALTH_HTTP](./DOCLING_HEALTH_HTTP.md) | docling | availability | true |
| [DQL_HEADER_REQUIRED](./DQL_HEADER_REQUIRED.md) | dql | configuration | false |
| [DQL_HOST_NOT_ALLOWED](./DQL_HOST_NOT_ALLOWED.md) | dql | state | false |
| [DQL_HTTP](./DQL_HTTP.md) | dql | availability | true |
| [DQL_OUTPUT_MARKDOWN_REQUIRED](./DQL_OUTPUT_MARKDOWN_REQUIRED.md) | dql | configuration | false |
| [DQL_PRIVATE_DNS](./DQL_PRIVATE_DNS.md) | dql | state | false |
| [DQL_PRIVATE_HOST](./DQL_PRIVATE_HOST.md) | dql | state | false |
| [DQL_RESPONSE_TOO_LARGE](./DQL_RESPONSE_TOO_LARGE.md) | dql | state | true |
| [DQL_SOURCE_REQUIRED](./DQL_SOURCE_REQUIRED.md) | dql | configuration | false |
| [DSL_MISSING_KEY](./DSL_MISSING_KEY.md) | dsl | state | false |
| [DSL_OBJECT_REQUIRED](./DSL_OBJECT_REQUIRED.md) | dsl | configuration | false |
| [DSL_STRING_ARRAY_REQUIRED](./DSL_STRING_ARRAY_REQUIRED.md) | dsl | configuration | false |
| [DSL_TEXT_REQUIRED](./DSL_TEXT_REQUIRED.md) | dsl | configuration | false |
| [DSL_UNKNOWN_KEY](./DSL_UNKNOWN_KEY.md) | dsl | configuration | false |
| [DT_DASHBOARD_PORT_INVALID](./DT_DASHBOARD_PORT_INVALID.md) | dt | configuration | false |
| [DUPLICATE_SCENE_PATH](./DUPLICATE_SCENE_PATH.md) | duplicate | state | false |
| [DUPLICATE_TWIN_COMPONENT](./DUPLICATE_TWIN_COMPONENT.md) | duplicate | state | false |
| [EMPTY_VIDEO_BLOB](./EMPTY_VIDEO_BLOB.md) | empty | availability | true |
| [ERROR_CATALOG_CODE_DUPLICATE](./ERROR_CATALOG_CODE_DUPLICATE.md) | error | integrity | false |
| [ERROR_CATALOG_CODE_INVALID](./ERROR_CATALOG_CODE_INVALID.md) | error | configuration | false |
| [ERROR_CATALOG_COVERAGE](./ERROR_CATALOG_COVERAGE.md) | error | state | false |
| [ERROR_CATALOG_FIELD_INVALID](./ERROR_CATALOG_FIELD_INVALID.md) | error | configuration | false |
| [ERROR_CATALOG_INVALID](./ERROR_CATALOG_INVALID.md) | error | configuration | false |
| [ERROR_DOCS_DRIFT](./ERROR_DOCS_DRIFT.md) | error | state | false |
| [ERROR_LITERAL_UNSTANDARDIZED](./ERROR_LITERAL_UNSTANDARDIZED.md) | error | state | false |
| [ERROR_REFERENCE_ASSETS_NOT_FOUND](./ERROR_REFERENCE_ASSETS_NOT_FOUND.md) | error | configuration | false |
| [ERROR_REFERENCE_CATALOG_INVALID](./ERROR_REFERENCE_CATALOG_INVALID.md) | error | configuration | false |
| [ERROR_REFERENCE_CODE_INVALID](./ERROR_REFERENCE_CODE_INVALID.md) | error | configuration | false |
| [ERROR_REFERENCE_NOT_FOUND](./ERROR_REFERENCE_NOT_FOUND.md) | error | configuration | false |
| [EXAMPLE_CONNECTOR_FAILURE](./EXAMPLE_CONNECTOR_FAILURE.md) | example | state | false |
| [EXPECTED_KEY_VALUE](./EXPECTED_KEY_VALUE.md) | expected | state | false |
| [FACTORY_DEMO_BLUEPRINT_IDENTITY_INVALID](./FACTORY_DEMO_BLUEPRINT_IDENTITY_INVALID.md) | factory | configuration | false |
| [FACTORY_DEMO_BLUEPRINT_REQUIRED](./FACTORY_DEMO_BLUEPRINT_REQUIRED.md) | factory | configuration | false |
| [FACTORY_DEMO_BLUEPRINT_UNREADABLE](./FACTORY_DEMO_BLUEPRINT_UNREADABLE.md) | factory | configuration | false |
| [FACTORY_DEMO_ENVIRONMENT_IDENTITY_INVALID](./FACTORY_DEMO_ENVIRONMENT_IDENTITY_INVALID.md) | factory | configuration | false |
| [FACTORY_DEMO_ENVIRONMENT_UNREADABLE](./FACTORY_DEMO_ENVIRONMENT_UNREADABLE.md) | factory | configuration | false |
| [FACTORY_DEMO_TARGET_INVALID](./FACTORY_DEMO_TARGET_INVALID.md) | factory | configuration | false |
| [GEOMETRY_BUILD_COORDINATE_SYSTEM_INVALID](./GEOMETRY_BUILD_COORDINATE_SYSTEM_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_COORDINATE_SYSTEM_REQUIRED](./GEOMETRY_BUILD_COORDINATE_SYSTEM_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_COORDINATE_SYSTEM_UNKNOWN_KEY](./GEOMETRY_BUILD_COORDINATE_SYSTEM_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_DEPENDENCIES_INVALID](./GEOMETRY_BUILD_DEPENDENCIES_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_DEPENDENCY_DUPLICATE](./GEOMETRY_BUILD_DEPENDENCY_DUPLICATE.md) | geometry build | integrity | false |
| [GEOMETRY_BUILD_DEPENDENCY_FETCH_INVALID](./GEOMETRY_BUILD_DEPENDENCY_FETCH_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_DEPENDENCY_FETCH_UNKNOWN_KEY](./GEOMETRY_BUILD_DEPENDENCY_FETCH_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_DEPENDENCY_HASH_INVALID](./GEOMETRY_BUILD_DEPENDENCY_HASH_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_DEPENDENCY_INVALID](./GEOMETRY_BUILD_DEPENDENCY_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_DEPENDENCY_PATH_INVALID](./GEOMETRY_BUILD_DEPENDENCY_PATH_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_DEPENDENCY_UNKNOWN_KEY](./GEOMETRY_BUILD_DEPENDENCY_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_DEPENDENCY_URI_INVALID](./GEOMETRY_BUILD_DEPENDENCY_URI_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_ENGINE_INVALID](./GEOMETRY_BUILD_ENGINE_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_ENGINE_REQUIRED](./GEOMETRY_BUILD_ENGINE_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_ENGINE_UNKNOWN_KEY](./GEOMETRY_BUILD_ENGINE_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_FA_INVALID](./GEOMETRY_BUILD_FA_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_FN_INVALID](./GEOMETRY_BUILD_FN_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_FS_INVALID](./GEOMETRY_BUILD_FS_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_HARD_WARNINGS_INVALID](./GEOMETRY_BUILD_HARD_WARNINGS_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_HEADER_INVALID](./GEOMETRY_BUILD_HEADER_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_OPTIONS_REQUIRED](./GEOMETRY_BUILD_OPTIONS_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_OPTIONS_UNKNOWN_KEY](./GEOMETRY_BUILD_OPTIONS_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_OUTPUTS_INVALID](./GEOMETRY_BUILD_OUTPUTS_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_OUTPUTS_REQUIRED](./GEOMETRY_BUILD_OUTPUTS_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_OUTPUTS_UNKNOWN_KEY](./GEOMETRY_BUILD_OUTPUTS_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_PARAMETER_INVALID](./GEOMETRY_BUILD_PARAMETER_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_PARAMETER_SET_INVALID](./GEOMETRY_BUILD_PARAMETER_SET_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_PARAMETER_VALUES_INVALID](./GEOMETRY_BUILD_PARAMETER_VALUES_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_PARAMETERS_REQUIRED](./GEOMETRY_BUILD_PARAMETERS_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_PARAMETERS_UNKNOWN_KEY](./GEOMETRY_BUILD_PARAMETERS_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_ARTIFACT_HASH_INVALID](./GEOMETRY_BUILD_RECEIPT_ARTIFACT_HASH_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_BUILD_HASH_INVALID](./GEOMETRY_BUILD_RECEIPT_BUILD_HASH_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_FAILURE_INVALID](./GEOMETRY_BUILD_RECEIPT_FAILURE_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_GEOMETRY_HASH_PROFILE_INVALID](./GEOMETRY_BUILD_RECEIPT_GEOMETRY_HASH_PROFILE_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_INVALID](./GEOMETRY_BUILD_RECEIPT_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_PARAMETER_HASH_INVALID](./GEOMETRY_BUILD_RECEIPT_PARAMETER_HASH_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_REQUIRED](./GEOMETRY_BUILD_RECEIPT_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_SUCCESS_INVALID](./GEOMETRY_BUILD_RECEIPT_SUCCESS_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_VALIDATION_INVALID](./GEOMETRY_BUILD_RECEIPT_VALIDATION_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_RECEIPT_VALIDATION_POLICY_HASH_INVALID](./GEOMETRY_BUILD_RECEIPT_VALIDATION_POLICY_HASH_INVALID.md) | geometry build | policy | false |
| [GEOMETRY_BUILD_RECEIPT_VALIDATION_REQUIRED](./GEOMETRY_BUILD_RECEIPT_VALIDATION_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_REFERENCE_HASH_INVALID](./GEOMETRY_BUILD_REFERENCE_HASH_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_REFERENCE_INVALID](./GEOMETRY_BUILD_REFERENCE_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_REFERENCE_TOLERANCE_INVALID](./GEOMETRY_BUILD_REFERENCE_TOLERANCE_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_REFERENCE_UNKNOWN_KEY](./GEOMETRY_BUILD_REFERENCE_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_REQUIRED](./GEOMETRY_BUILD_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_SOURCE_HASH_INVALID](./GEOMETRY_BUILD_SOURCE_HASH_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_SOURCE_INVALID](./GEOMETRY_BUILD_SOURCE_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_SOURCE_REQUIRED](./GEOMETRY_BUILD_SOURCE_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_SOURCE_UNKNOWN_KEY](./GEOMETRY_BUILD_SOURCE_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_SOURCE_URI_INVALID](./GEOMETRY_BUILD_SOURCE_URI_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_TARGET_INVALID](./GEOMETRY_BUILD_TARGET_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_TARGET_REQUIRED](./GEOMETRY_BUILD_TARGET_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_TARGET_UNKNOWN_KEY](./GEOMETRY_BUILD_TARGET_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_TIMEOUT_INVALID](./GEOMETRY_BUILD_TIMEOUT_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_TRIANGLE_LIMIT_INVALID](./GEOMETRY_BUILD_TRIANGLE_LIMIT_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_UNKNOWN_KEY](./GEOMETRY_BUILD_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_VALIDATIONS_INVALID](./GEOMETRY_BUILD_VALIDATIONS_INVALID.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_VALIDATIONS_REQUIRED](./GEOMETRY_BUILD_VALIDATIONS_REQUIRED.md) | geometry build | configuration | false |
| [GEOMETRY_BUILD_VALIDATIONS_UNKNOWN_KEY](./GEOMETRY_BUILD_VALIDATIONS_UNKNOWN_KEY.md) | geometry build | configuration | false |
| [GEOMETRY_DEPENDENCY_CACHE_HASH_MISMATCH](./GEOMETRY_DEPENDENCY_CACHE_HASH_MISMATCH.md) | geometry dependency | integrity | false |
| [GEOMETRY_DEPENDENCY_EMPTY](./GEOMETRY_DEPENDENCY_EMPTY.md) | geometry dependency | state | false |
| [GEOMETRY_DEPENDENCY_FETCH_HASH_MISMATCH](./GEOMETRY_DEPENDENCY_FETCH_HASH_MISMATCH.md) | geometry dependency | integrity | false |
| [GEOMETRY_DEPENDENCY_FETCH_TARGET_OUTSIDE_PROJECT](./GEOMETRY_DEPENDENCY_FETCH_TARGET_OUTSIDE_PROJECT.md) | geometry dependency | state | false |
| [GEOMETRY_DEPENDENCY_MISSING](./GEOMETRY_DEPENDENCY_MISSING.md) | geometry dependency | configuration | false |
| [GEOMETRY_DEPENDENCY_REVISION_MISMATCH](./GEOMETRY_DEPENDENCY_REVISION_MISMATCH.md) | geometry dependency | integrity | false |
| [GEOMETRY_DEPENDENCY_SUBPATH_MISSING](./GEOMETRY_DEPENDENCY_SUBPATH_MISSING.md) | geometry dependency | configuration | false |
| [GEOMETRY_DEPENDENCY_TYPE_INVALID](./GEOMETRY_DEPENDENCY_TYPE_INVALID.md) | geometry dependency | configuration | false |
| [GEOMETRY_VALIDATION_FAILED](./GEOMETRY_VALIDATION_FAILED.md) | geometry | state | false |
| [GEOMETRY_WORKER_RECEIPT_MISSING](./GEOMETRY_WORKER_RECEIPT_MISSING.md) | geometry | configuration | false |
| [GEOMETRY_WORKER_SCRIPT_MISSING](./GEOMETRY_WORKER_SCRIPT_MISSING.md) | geometry | configuration | false |
| [GLB_ACCESSOR_OUT_OF_BOUNDS](./GLB_ACCESSOR_OUT_OF_BOUNDS.md) | glb | integrity | false |
| [GLB_ACCESSOR_UNSUPPORTED](./GLB_ACCESSOR_UNSUPPORTED.md) | glb | configuration | false |
| [GLB_INDEX_ACCESSOR_OUT_OF_BOUNDS](./GLB_INDEX_ACCESSOR_OUT_OF_BOUNDS.md) | glb | integrity | false |
| [GLB_INDEX_ACCESSOR_UNSUPPORTED](./GLB_INDEX_ACCESSOR_UNSUPPORTED.md) | glb | configuration | false |
| [GLB_MULTI_ACCESSOR_MESH_UNSUPPORTED](./GLB_MULTI_ACCESSOR_MESH_UNSUPPORTED.md) | glb | configuration | false |
| [GLB_UINT_INDEX_EXTENSION_UNAVAILABLE](./GLB_UINT_INDEX_EXTENSION_UNAVAILABLE.md) | glb | availability | true |
| [IMPROVEMENT_ACTION_INVALID](./IMPROVEMENT_ACTION_INVALID.md) | improvement | configuration | false |
| [IMPROVEMENT_ACTION_KIND_INVALID](./IMPROVEMENT_ACTION_KIND_INVALID.md) | improvement | configuration | false |
| [IMPROVEMENT_ACTION_UNKNOWN_KEY](./IMPROVEMENT_ACTION_UNKNOWN_KEY.md) | improvement | configuration | false |
| [IMPROVEMENT_BOOL_INVALID](./IMPROVEMENT_BOOL_INVALID.md) | improvement | configuration | false |
| [IMPROVEMENT_DOCUMENT_INVALID](./IMPROVEMENT_DOCUMENT_INVALID.md) | improvement | configuration | false |
| [IMPROVEMENT_DOCUMENT_REQUIRED](./IMPROVEMENT_DOCUMENT_REQUIRED.md) | improvement | configuration | false |
| [IMPROVEMENT_HEADER_REQUIRED](./IMPROVEMENT_HEADER_REQUIRED.md) | improvement | configuration | false |
| [IMPROVEMENT_UNKNOWN_KEY](./IMPROVEMENT_UNKNOWN_KEY.md) | improvement | configuration | false |
| [INVALID_PROCESS_URI](./INVALID_PROCESS_URI.md) | invalid | state | false |
| [INVALID_RESOURCE_URI](./INVALID_RESOURCE_URI.md) | invalid | state | false |
| [INVALID_SCENE](./INVALID_SCENE.md) | invalid | state | false |
| [INVALID_SCENE_BINDING](./INVALID_SCENE_BINDING.md) | invalid | state | false |
| [INVALID_SCENE_ORIENTATION](./INVALID_SCENE_ORIENTATION.md) | invalid | state | false |
| [INVALID_SCENE_POSITION](./INVALID_SCENE_POSITION.md) | invalid | state | false |
| [INVALID_SCENE_SIZE](./INVALID_SCENE_SIZE.md) | invalid | state | false |
| [INVALID_SERVER_RESPONSE](./INVALID_SERVER_RESPONSE.md) | dashboard | availability | true |
| [INVALID_T2C_INTENT](./INVALID_T2C_INTENT.md) | invalid | state | false |
| [INVALID_T2C_INTENT_KEYS](./INVALID_T2C_INTENT_KEYS.md) | invalid | state | false |
| [INVALID_T2C_INTENT_PACK](./INVALID_T2C_INTENT_PACK.md) | invalid | state | false |
| [INVALID_T2C_INTENT_SOURCE](./INVALID_T2C_INTENT_SOURCE.md) | invalid | state | false |
| [INVALID_T2C_INTENT_TICKET](./INVALID_T2C_INTENT_TICKET.md) | invalid | state | false |
| [INVALID_TWIN](./INVALID_TWIN.md) | invalid | state | false |
| [INVALID_TWIN_COMPONENT](./INVALID_TWIN_COMPONENT.md) | invalid | state | false |
| [ISOLATED_WORKTREE_FAILED](./ISOLATED_WORKTREE_FAILED.md) | isolated | state | false |
| [ITERATION_BLOCKED](./ITERATION_BLOCKED.md) | iteration | state | false |
| [ITERATION_IN_PROGRESS](./ITERATION_IN_PROGRESS.md) | iteration | state | true |
| [LIVE_BINDING_DOCUMENT_INVALID](./LIVE_BINDING_DOCUMENT_INVALID.md) | live | configuration | false |
| [LIVE_BINDING_DOCUMENT_REQUIRED](./LIVE_BINDING_DOCUMENT_REQUIRED.md) | live | configuration | false |
| [LIVE_BINDING_DOCUMENT_UNKNOWN_KEY](./LIVE_BINDING_DOCUMENT_UNKNOWN_KEY.md) | live | configuration | false |
| [LIVE_BINDING_DURATION_INVALID](./LIVE_BINDING_DURATION_INVALID.md) | live | configuration | false |
| [LIVE_BINDING_END_REQUIRED](./LIVE_BINDING_END_REQUIRED.md) | live | configuration | false |
| [LIVE_BINDING_INVALID](./LIVE_BINDING_INVALID.md) | live | configuration | false |
| [LIVE_BINDING_KEY_VALUE_REQUIRED](./LIVE_BINDING_KEY_VALUE_REQUIRED.md) | live | configuration | false |
| [LIVE_BINDING_LINE_OUTSIDE](./LIVE_BINDING_LINE_OUTSIDE.md) | live | state | false |
| [LIVE_BINDING_NESTED_UNKNOWN_KEY](./LIVE_BINDING_NESTED_UNKNOWN_KEY.md) | live | configuration | false |
| [LIVE_BINDING_NOT_STARTED](./LIVE_BINDING_NOT_STARTED.md) | live | state | false |
| [LIVE_BINDING_RANGE_INVALID](./LIVE_BINDING_RANGE_INVALID.md) | live | configuration | false |
| [LIVE_BINDING_TARGET_COMPONENT_UNKNOWN](./LIVE_BINDING_TARGET_COMPONENT_UNKNOWN.md) | live | state | false |
| [LIVE_BINDING_TARGET_INVALID](./LIVE_BINDING_TARGET_INVALID.md) | live | configuration | false |
| [LIVE_BINDING_UNKNOWN_KEY](./LIVE_BINDING_UNKNOWN_KEY.md) | live | configuration | false |
| [LIVE_BINDING_VALUE_INVALID](./LIVE_BINDING_VALUE_INVALID.md) | live | configuration | false |
| [LIVE_BINDING_VALUE_STATE_INVALID](./LIVE_BINDING_VALUE_STATE_INVALID.md) | live | configuration | false |
| [LIVE_BINDINGS_HEADER_REQUIRED](./LIVE_BINDINGS_HEADER_REQUIRED.md) | live | configuration | false |
| [LIVING_PROJECT_LEASE_HELD](./LIVING_PROJECT_LEASE_HELD.md) | living project | state | true |
| [LIVING_WATCH_ALREADY_STARTED](./LIVING_WATCH_ALREADY_STARTED.md) | living | state | true |
| [LIVING_WATCH_BUILD_ALREADY_RUNNING](./LIVING_WATCH_BUILD_ALREADY_RUNNING.md) | living | state | true |
| [LLM_MODE_INVALID](./LLM_MODE_INVALID.md) | llm | configuration | false |
| [MANIFEST_INVALID](./MANIFEST_INVALID.md) | manifest | configuration | false |
| [MANIFEST_INVALID_JSON](./MANIFEST_INVALID_JSON.md) | manifest | state | false |
| [MANIFEST_MISSING](./MANIFEST_MISSING.md) | manifest | configuration | false |
| [MATH_HEADER_REQUIRED](./MATH_HEADER_REQUIRED.md) | math | configuration | false |
| [MISSING_BINDING](./MISSING_BINDING.md) | missing | state | false |
| [MISSING_EXPRESSION](./MISSING_EXPRESSION.md) | missing | state | false |
| [MUTATION_APPLY_AFTER_ANALYSIS_REQUIRED](./MUTATION_APPLY_AFTER_ANALYSIS_REQUIRED.md) | mutation apply | configuration | false |
| [MUTATION_APPLY_APPROVAL_HASH_REQUIRED](./MUTATION_APPLY_APPROVAL_HASH_REQUIRED.md) | mutation apply | policy | false |
| [MUTATION_APPLY_BEFORE_ANALYSIS_REQUIRED](./MUTATION_APPLY_BEFORE_ANALYSIS_REQUIRED.md) | mutation apply | configuration | false |
| [MUTATION_APPLY_CLOSE_RESULT_INVALID](./MUTATION_APPLY_CLOSE_RESULT_INVALID.md) | mutation apply | configuration | false |
| [MUTATION_APPLY_GRANT_CONSUME](./MUTATION_APPLY_GRANT_CONSUME.md) | mutation apply | policy | false |
| [MUTATION_APPLY_GRANT_INVALID](./MUTATION_APPLY_GRANT_INVALID.md) | mutation apply | policy | false |
| [MUTATION_APPLY_REQUIRES_APPLY_MODE](./MUTATION_APPLY_REQUIRES_APPLY_MODE.md) | mutation apply | state | false |
| [MUTATION_APPLY_SELF_MODIFICATION_DISABLED](./MUTATION_APPLY_SELF_MODIFICATION_DISABLED.md) | mutation apply | state | false |
| [MUTATION_APPLY_TODO2CODE_REQUIRED](./MUTATION_APPLY_TODO2CODE_REQUIRED.md) | mutation apply | configuration | false |
| [mutation_grant_actor_mismatch](./mutation_grant_actor_mismatch.md) | mutation grant | policy | false |
| [mutation_grant_artifact_mismatch](./mutation_grant_artifact_mismatch.md) | mutation grant | policy | false |
| [mutation_grant_document_invalid](./mutation_grant_document_invalid.md) | mutation grant | policy | false |
| [mutation_grant_envelope_mismatch](./mutation_grant_envelope_mismatch.md) | mutation grant | policy | false |
| [mutation_grant_expired](./mutation_grant_expired.md) | mutation grant | policy | false |
| [mutation_grant_field_required](./mutation_grant_field_required.md) | mutation grant | policy | false |
| [mutation_grant_file_not_configured](./mutation_grant_file_not_configured.md) | mutation grant | availability | true |
| [MUTATION_GRANT_FILE_REQUIRED](./MUTATION_GRANT_FILE_REQUIRED.md) | mutation grant | policy | false |
| [mutation_grant_jti_invalid](./mutation_grant_jti_invalid.md) | mutation grant | policy | false |
| [mutation_grant_plan_hash_mismatch](./mutation_grant_plan_hash_mismatch.md) | mutation grant | policy | false |
| [mutation_grant_project_mismatch](./mutation_grant_project_mismatch.md) | mutation grant | policy | false |
| [mutation_grant_replay](./mutation_grant_replay.md) | mutation grant | policy | false |
| [mutation_grant_required](./mutation_grant_required.md) | mutation grant | policy | false |
| [mutation_grant_risk_class_invalid](./mutation_grant_risk_class_invalid.md) | mutation grant | policy | false |
| [mutation_grant_schema_invalid](./mutation_grant_schema_invalid.md) | mutation grant | policy | false |
| [mutation_grant_secret_missing](./mutation_grant_secret_missing.md) | mutation grant | policy | false |
| [mutation_grant_signature_invalid](./mutation_grant_signature_invalid.md) | mutation grant | policy | false |
| [mutation_grant_signature_missing](./mutation_grant_signature_missing.md) | mutation grant | policy | false |
| [mutation_grant_target_mismatch](./mutation_grant_target_mismatch.md) | mutation grant | policy | false |
| [mutation_grant_ttl_exceeds_max](./mutation_grant_ttl_exceeds_max.md) | mutation grant | policy | false |
| [mutation_grant_ttl_invalid](./mutation_grant_ttl_invalid.md) | mutation grant | policy | false |
| [mutation_grant_unreadable](./mutation_grant_unreadable.md) | mutation grant | policy | false |
| [MUTATION_PLAN_REQUIRED](./MUTATION_PLAN_REQUIRED.md) | mutation | configuration | false |
| [MUTATION_REFUSED_OBSERVE_MODE](./MUTATION_REFUSED_OBSERVE_MODE.md) | mutation | state | false |
| [NO_CHANGE](./NO_CHANGE.md) | no | state | false |
| [NO_SCENE_YET](./NO_SCENE_YET.md) | no | state | false |
| [NON_BOOLEAN_VALUE](./NON_BOOLEAN_VALUE.md) | non | state | false |
| [NON_NUMERIC_VALUE](./NON_NUMERIC_VALUE.md) | non | state | false |
| [NOT_FOUND](./NOT_FOUND.md) | not | configuration | false |
| [OBSERVATION_DOCUMENT_INVALID](./OBSERVATION_DOCUMENT_INVALID.md) | observation | configuration | false |
| [OBSERVATION_DOCUMENT_REQUIRED](./OBSERVATION_DOCUMENT_REQUIRED.md) | observation | configuration | false |
| [OBSERVATION_END_REQUIRED](./OBSERVATION_END_REQUIRED.md) | observation | configuration | false |
| [OBSERVATION_KEY_VALUE_REQUIRED](./OBSERVATION_KEY_VALUE_REQUIRED.md) | observation | configuration | false |
| [OBSERVATION_LINE_OUTSIDE](./OBSERVATION_LINE_OUTSIDE.md) | observation | state | false |
| [OBSERVATION_MISSING](./OBSERVATION_MISSING.md) | observation | configuration | false |
| [OBSERVATION_NOT_STARTED](./OBSERVATION_NOT_STARTED.md) | observation | state | false |
| [OBSERVATION_RECORD_INVALID](./OBSERVATION_RECORD_INVALID.md) | observation | configuration | false |
| [OBSERVATION_RECORD_UNKNOWN_KEY](./OBSERVATION_RECORD_UNKNOWN_KEY.md) | observation | configuration | false |
| [OBSERVATION_SEVERITY_INVALID](./OBSERVATION_SEVERITY_INVALID.md) | observation | configuration | false |
| [OBSERVATION_UNIT_MIXED_FORBIDDEN](./OBSERVATION_UNIT_MIXED_FORBIDDEN.md) | observation | policy | false |
| [OBSERVATION_UNKNOWN_KEY](./OBSERVATION_UNKNOWN_KEY.md) | observation | configuration | false |
| [OBSERVATIONS_HEADER_INVALID](./OBSERVATIONS_HEADER_INVALID.md) | observation | configuration | false |
| [OBSERVATIONS_HEADER_REQUIRED](./OBSERVATIONS_HEADER_REQUIRED.md) | observation | configuration | false |
| [OPENROUTER_CHOICES_MISSING](./OPENROUTER_CHOICES_MISSING.md) | openrouter | configuration | false |
| [OPENROUTER_CONTENT_MISSING](./OPENROUTER_CONTENT_MISSING.md) | openrouter | configuration | false |
| [OPENROUTER_HTTP](./OPENROUTER_HTTP.md) | openrouter | availability | true |
| [OPENROUTER_INVALID_JSON](./OPENROUTER_INVALID_JSON.md) | openrouter | state | false |
| [OPENROUTER_NOT_CONFIGURED](./OPENROUTER_NOT_CONFIGURED.md) | openrouter | availability | true |
| [PATCH_ARRAY_INDEX_INVALID](./PATCH_ARRAY_INDEX_INVALID.md) | patch | configuration | false |
| [PATCH_ARRAY_INDEX_MISSING](./PATCH_ARRAY_INDEX_MISSING.md) | patch | configuration | false |
| [PATCH_BASE_HASH_INVALID](./PATCH_BASE_HASH_INVALID.md) | patch | configuration | false |
| [PATCH_BASE_HASH_MISMATCH](./PATCH_BASE_HASH_MISMATCH.md) | patch | integrity | false |
| [PATCH_CR_FORBIDDEN](./PATCH_CR_FORBIDDEN.md) | patch | policy | false |
| [PATCH_END_REQUIRED](./PATCH_END_REQUIRED.md) | patch | configuration | false |
| [PATCH_ENVELOPE_INVALID](./PATCH_ENVELOPE_INVALID.md) | patch | configuration | false |
| [PATCH_ENVELOPE_KEYS_INVALID](./PATCH_ENVELOPE_KEYS_INVALID.md) | patch | configuration | false |
| [PATCH_HEADER_INVALID](./PATCH_HEADER_INVALID.md) | patch | configuration | false |
| [PATCH_JSON_STRING_INVALID](./PATCH_JSON_STRING_INVALID.md) | patch | configuration | false |
| [PATCH_OBJECT_REQUIRED](./PATCH_OBJECT_REQUIRED.md) | patch | configuration | false |
| [PATCH_OPERATION_INVALID](./PATCH_OPERATION_INVALID.md) | patch | configuration | false |
| [PATCH_OPERATION_LIMIT](./PATCH_OPERATION_LIMIT.md) | patch | state | true |
| [PATCH_OPERATION_REQUIRED](./PATCH_OPERATION_REQUIRED.md) | patch | configuration | false |
| [PATCH_PARENT_MISSING](./PATCH_PARENT_MISSING.md) | patch | configuration | false |
| [PATCH_PATH_FORBIDDEN](./PATCH_PATH_FORBIDDEN.md) | patch | policy | false |
| [PATCH_POINTER_DEPTH](./PATCH_POINTER_DEPTH.md) | patch | state | false |
| [PATCH_POINTER_INVALID](./PATCH_POINTER_INVALID.md) | patch | configuration | false |
| [PATCH_POINTER_UNSAFE](./PATCH_POINTER_UNSAFE.md) | patch | state | false |
| [PATCH_REMOVE_MISSING](./PATCH_REMOVE_MISSING.md) | patch | configuration | false |
| [PATCH_STRING_REQUIRED](./PATCH_STRING_REQUIRED.md) | patch | configuration | false |
| [PATCH_TARGET_INVALID](./PATCH_TARGET_INVALID.md) | patch | configuration | false |
| [PATCH_TARGET_MISMATCH](./PATCH_TARGET_MISMATCH.md) | patch | integrity | false |
| [PATCH_VALUE_INVALID](./PATCH_VALUE_INVALID.md) | patch | configuration | false |
| [PHYSICAL_EVIDENCE_ASSET_INVALID](./PHYSICAL_EVIDENCE_ASSET_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_COMPONENT_ID_INVALID](./PHYSICAL_EVIDENCE_COMPONENT_ID_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_CONSTRAINT_DISTANCE_INVALID](./PHYSICAL_EVIDENCE_CONSTRAINT_DISTANCE_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_CONSTRAINT_DISTANCE_REQUIRED](./PHYSICAL_EVIDENCE_CONSTRAINT_DISTANCE_REQUIRED.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_CONSTRAINT_ID_INVALID](./PHYSICAL_EVIDENCE_CONSTRAINT_ID_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_CONSTRAINT_INVALID](./PHYSICAL_EVIDENCE_CONSTRAINT_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_CONSTRAINT_MARGIN_INVALID](./PHYSICAL_EVIDENCE_CONSTRAINT_MARGIN_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_CONSTRAINT_UNKNOWN_KEY](./PHYSICAL_EVIDENCE_CONSTRAINT_UNKNOWN_KEY.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_CONSTRAINTS_INVALID](./PHYSICAL_EVIDENCE_CONSTRAINTS_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_COORDINATE_SYSTEM_INVALID](./PHYSICAL_EVIDENCE_COORDINATE_SYSTEM_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_DUPLICATE](./PHYSICAL_EVIDENCE_DUPLICATE.md) | physical evidence | integrity | false |
| [PHYSICAL_EVIDENCE_GRADE_INVALID](./PHYSICAL_EVIDENCE_GRADE_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_INVALID](./PHYSICAL_EVIDENCE_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_KIND_INVALID](./PHYSICAL_EVIDENCE_KIND_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_ORIENTATION_INVALID](./PHYSICAL_EVIDENCE_ORIENTATION_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_POSITION_INVALID](./PHYSICAL_EVIDENCE_POSITION_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_RECORD_INVALID](./PHYSICAL_EVIDENCE_RECORD_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_REJECTED](./PHYSICAL_EVIDENCE_REJECTED.md) | physical evidence | policy | false |
| [PHYSICAL_EVIDENCE_REQUIRED](./PHYSICAL_EVIDENCE_REQUIRED.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_SIZE_INVALID](./PHYSICAL_EVIDENCE_SIZE_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_SIZE_NOT_POSITIVE](./PHYSICAL_EVIDENCE_SIZE_NOT_POSITIVE.md) | physical evidence | state | false |
| [PHYSICAL_EVIDENCE_SOURCE_REF_INVALID](./PHYSICAL_EVIDENCE_SOURCE_REF_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_TOLERANCE_INVALID](./PHYSICAL_EVIDENCE_TOLERANCE_INVALID.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_UNKNOWN_KEY](./PHYSICAL_EVIDENCE_UNKNOWN_KEY.md) | physical evidence | configuration | false |
| [PHYSICAL_EVIDENCE_UNKNOWN_RECORD_KEY](./PHYSICAL_EVIDENCE_UNKNOWN_RECORD_KEY.md) | physical evidence | state | false |
| [PRESENTATION_CAMERA_INVALID](./PRESENTATION_CAMERA_INVALID.md) | presentation | configuration | false |
| [PRESENTATION_CAPTURE_DUPLICATE](./PRESENTATION_CAPTURE_DUPLICATE.md) | presentation | integrity | false |
| [PRESENTATION_CAPTURE_INVALID](./PRESENTATION_CAPTURE_INVALID.md) | presentation | configuration | false |
| [PRESENTATION_CAPTURES_REQUIRED](./PRESENTATION_CAPTURES_REQUIRED.md) | presentation | configuration | false |
| [PRESENTATION_EVIDENCE_HEADER_INVALID](./PRESENTATION_EVIDENCE_HEADER_INVALID.md) | presentation evidence | configuration | false |
| [PRESENTATION_EVIDENCE_INVALID](./PRESENTATION_EVIDENCE_INVALID.md) | presentation evidence | configuration | false |
| [PRESENTATION_RENDERER_INVALID](./PRESENTATION_RENDERER_INVALID.md) | presentation | configuration | false |
| [PRESENTATION_UNKNOWN_KEY](./PRESENTATION_UNKNOWN_KEY.md) | presentation | configuration | false |
| [PROBE_CYCLE_HOST_INVALID](./PROBE_CYCLE_HOST_INVALID.md) | probe | configuration | false |
| [PROBE_CYCLE_OBSERVED_AT_INVALID](./PROBE_CYCLE_OBSERVED_AT_INVALID.md) | probe | configuration | false |
| [PROBE_CYCLE_RESULTS_INVALID](./PROBE_CYCLE_RESULTS_INVALID.md) | probe | configuration | false |
| [PROBE_CYCLE_SCHEMA_INVALID](./PROBE_CYCLE_SCHEMA_INVALID.md) | probe | configuration | false |
| [PROBE_RESULT_INVALID](./PROBE_RESULT_INVALID.md) | probe | configuration | false |
| [PROBE_RESULT_WATCHES_REQUIRED](./PROBE_RESULT_WATCHES_REQUIRED.md) | probe | configuration | false |
| [PROCESS_ANIMATION_COMPONENT_MISSING](./PROCESS_ANIMATION_COMPONENT_MISSING.md) | process | configuration | false |
| [PROCESS_ANIMATION_INVALID](./PROCESS_ANIMATION_INVALID.md) | process | configuration | false |
| [PROCESS_ANIMATION_TIMING_INVALID](./PROCESS_ANIMATION_TIMING_INVALID.md) | process | configuration | false |
| [PROCESS_COMPLETE_WITH_GAPS](./PROCESS_COMPLETE_WITH_GAPS.md) | process | state | false |
| [PROCESS_COMPONENT_MISSING](./PROCESS_COMPONENT_MISSING.md) | process | configuration | false |
| [PROCESS_DETAIL_DECLARED_ONLY](./PROCESS_DETAIL_DECLARED_ONLY.md) | process | state | false |
| [PROCESS_DSL_INVALID](./PROCESS_DSL_INVALID.md) | process | configuration | false |
| [PROCESS_EVIDENCE_MISSING](./PROCESS_EVIDENCE_MISSING.md) | process | state | false |
| [PROCESS_ID_DUPLICATE](./PROCESS_ID_DUPLICATE.md) | process | integrity | false |
| [PROCESS_ORDERING_UNEVIDENCED](./PROCESS_ORDERING_UNEVIDENCED.md) | process | state | false |
| [PROCESS_STEP_ID_DUPLICATE](./PROCESS_STEP_ID_DUPLICATE.md) | process | integrity | false |
| [PROCESS_TIMING_UNSPECIFIED](./PROCESS_TIMING_UNSPECIFIED.md) | process | state | false |
| [PROCESS_TRANSITION_INVALID](./PROCESS_TRANSITION_INVALID.md) | process | configuration | false |
| [PROJECT_AUTONOMY_MODE_INVALID](./PROJECT_AUTONOMY_MODE_INVALID.md) | project | configuration | false |
| [PROJECT_BOOL_INVALID](./PROJECT_BOOL_INVALID.md) | project | configuration | false |
| [PROJECT_DEVELOPMENT_INVALID](./PROJECT_DEVELOPMENT_INVALID.md) | project | configuration | false |
| [PROJECT_DIRECTORY_NOT_EMPTY](./PROJECT_DIRECTORY_NOT_EMPTY.md) | project | state | false |
| [PROJECT_DOCUMENT_INVALID](./PROJECT_DOCUMENT_INVALID.md) | project | configuration | false |
| [PROJECT_DOCUMENT_REQUIRED](./PROJECT_DOCUMENT_REQUIRED.md) | project | configuration | false |
| [PROJECT_FAILURE_LIMIT_INVALID](./PROJECT_FAILURE_LIMIT_INVALID.md) | project | configuration | false |
| [PROJECT_HEADER_REQUIRED](./PROJECT_HEADER_REQUIRED.md) | project | configuration | false |
| [PROJECT_ITERATION_LIMIT_INVALID](./PROJECT_ITERATION_LIMIT_INVALID.md) | project | configuration | false |
| [PROJECT_KEY_VALUE_REQUIRED](./PROJECT_KEY_VALUE_REQUIRED.md) | project | configuration | false |
| [PROJECT_NAME_TOO_SHORT](./PROJECT_NAME_TOO_SHORT.md) | project | state | false |
| [PROJECT_OBSERVATIONS_INVALID](./PROJECT_OBSERVATIONS_INVALID.md) | project | configuration | false |
| [PROJECT_POLICY_ENVIRONMENT_INVALID](./PROJECT_POLICY_ENVIRONMENT_INVALID.md) | project | policy | false |
| [PROJECT_POLICY_INVALID](./PROJECT_POLICY_INVALID.md) | project | policy | false |
| [PROJECT_PROFILE_INVALID](./PROJECT_PROFILE_INVALID.md) | project | configuration | false |
| [PROJECT_SCENE_FORMAT_INVALID](./PROJECT_SCENE_FORMAT_INVALID.md) | project | configuration | false |
| [PROJECT_SCENE_INVALID](./PROJECT_SCENE_INVALID.md) | project | configuration | false |
| [PROJECT_SOURCE_INVALID](./PROJECT_SOURCE_INVALID.md) | project | configuration | false |
| [PROJECT_UNKNOWN_KEY](./PROJECT_UNKNOWN_KEY.md) | project | configuration | false |
| [PROJECT_WEBSITE_PROTOCOL_INVALID](./PROJECT_WEBSITE_PROTOCOL_INVALID.md) | project | configuration | false |
| [PROTO_FIELD_NUMBER_DUPLICATE](./PROTO_FIELD_NUMBER_DUPLICATE.md) | proto | integrity | false |
| [PROTO_FIELD_NUMBER_INVALID](./PROTO_FIELD_NUMBER_INVALID.md) | proto | configuration | false |
| [PROTO3_REQUIRED](./PROTO3_REQUIRED.md) | proto3 | configuration | false |
| [QUERY_HEADER_REQUIRED](./QUERY_HEADER_REQUIRED.md) | query | configuration | false |
| [REQUEST_BODY_TOO_LARGE](./REQUEST_BODY_TOO_LARGE.md) | request | state | true |
| [RESOURCE_DIGEST_INVALID](./RESOURCE_DIGEST_INVALID.md) | resource | configuration | false |
| [RESOURCE_PLAN_INVALID](./RESOURCE_PLAN_INVALID.md) | resource | configuration | false |
| [RESOURCE_PLAN_SOURCES_REQUIRED](./RESOURCE_PLAN_SOURCES_REQUIRED.md) | resource | configuration | false |
| [RESOURCE_SOURCE_INVALID](./RESOURCE_SOURCE_INVALID.md) | resource | configuration | false |
| [RUNTIME_PACKAGE_VERSION_MISSING](./RUNTIME_PACKAGE_VERSION_MISSING.md) | runtime | configuration | false |
| [SCENE_ASSET_NOT_GROUNDED](./SCENE_ASSET_NOT_GROUNDED.md) | scene | integrity | false |
| [SCENE_BLUEPRINT_BINDING_INVALID](./SCENE_BLUEPRINT_BINDING_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_BINDING_UNKNOWN_KEY](./SCENE_BLUEPRINT_BINDING_UNKNOWN_KEY.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_COMPONENT_DUPLICATE](./SCENE_BLUEPRINT_COMPONENT_DUPLICATE.md) | scene blueprint | integrity | false |
| [SCENE_BLUEPRINT_COMPONENT_INVALID](./SCENE_BLUEPRINT_COMPONENT_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_COMPONENT_UNGROUNDED](./SCENE_BLUEPRINT_COMPONENT_UNGROUNDED.md) | scene blueprint | state | false |
| [SCENE_BLUEPRINT_COMPONENT_UNKNOWN_KEY](./SCENE_BLUEPRINT_COMPONENT_UNKNOWN_KEY.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_FLAG_INVALID](./SCENE_BLUEPRINT_FLAG_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_INVALID](./SCENE_BLUEPRINT_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_LABEL_INVALID](./SCENE_BLUEPRINT_LABEL_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_MAX_SOURCE_URIS_INVALID](./SCENE_BLUEPRINT_MAX_SOURCE_URIS_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_ORIENTATION_INVALID](./SCENE_BLUEPRINT_ORIENTATION_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_PARENT_CYCLE](./SCENE_BLUEPRINT_PARENT_CYCLE.md) | scene blueprint | state | false |
| [SCENE_BLUEPRINT_PARENT_INVALID](./SCENE_BLUEPRINT_PARENT_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_PATH_DUPLICATE](./SCENE_BLUEPRINT_PATH_DUPLICATE.md) | scene blueprint | integrity | false |
| [SCENE_BLUEPRINT_PATH_EXCLUDES_INVALID](./SCENE_BLUEPRINT_PATH_EXCLUDES_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_PATH_INCLUDES_INVALID](./SCENE_BLUEPRINT_PATH_INCLUDES_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_POSITION_INVALID](./SCENE_BLUEPRINT_POSITION_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_PRIMITIVE_INVALID](./SCENE_BLUEPRINT_PRIMITIVE_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_PROPERTIES_INVALID](./SCENE_BLUEPRINT_PROPERTIES_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_PROPERTY_MAP_INVALID](./SCENE_BLUEPRINT_PROPERTY_MAP_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_REQUIRED](./SCENE_BLUEPRINT_REQUIRED.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_SIZE_INVALID](./SCENE_BLUEPRINT_SIZE_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_SOURCE_ROLES_INVALID](./SCENE_BLUEPRINT_SOURCE_ROLES_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_CONTRADICTORY](./SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_CONTRADICTORY.md) | scene blueprint | integrity | false |
| [SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_INVALID](./SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_INVALID.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_UNKNOWN_KEY](./SCENE_BLUEPRINT_SPATIAL_REQUIREMENTS_UNKNOWN_KEY.md) | scene blueprint | configuration | false |
| [SCENE_BLUEPRINT_UNKNOWN_KEY](./SCENE_BLUEPRINT_UNKNOWN_KEY.md) | scene blueprint | configuration | false |
| [SCENE_COMPONENT_NOT_FOUND](./SCENE_COMPONENT_NOT_FOUND.md) | scene | configuration | false |
| [SCENE_INVALID](./SCENE_INVALID.md) | scene | configuration | false |
| [SCENE_PATH_DUPLICATE](./SCENE_PATH_DUPLICATE.md) | scene | integrity | false |
| [SCENE_REQUIRED_BINDING_MISSING](./SCENE_REQUIRED_BINDING_MISSING.md) | scene | configuration | false |
| [SCENE_REVISION_STALE](./SCENE_REVISION_STALE.md) | scene | state | false |
| [SCENE_SOURCE_TWIN_MISMATCH](./SCENE_SOURCE_TWIN_MISMATCH.md) | scene | integrity | false |
| [SCENE_TWIN_URI_NOT_GROUNDED](./SCENE_TWIN_URI_NOT_GROUNDED.md) | scene | integrity | false |
| [SCENE_UNKNOWN_KEY](./SCENE_UNKNOWN_KEY.md) | scene | configuration | false |
| [SEMANTIC_MATH_AUTHORITY_FIELD_FORBIDDEN](./SEMANTIC_MATH_AUTHORITY_FIELD_FORBIDDEN.md) | semantic | policy | false |
| [SOURCE_COVERAGE_CONVERTER_INVALID](./SOURCE_COVERAGE_CONVERTER_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_CONVERTER_VERSION_INVALID](./SOURCE_COVERAGE_CONVERTER_VERSION_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_COVERAGE_HASH_INVALID](./SOURCE_COVERAGE_COVERAGE_HASH_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_DOCUMENT_SHAPE_INVALID](./SOURCE_COVERAGE_DOCUMENT_SHAPE_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_HASH_MISMATCH](./SOURCE_COVERAGE_HASH_MISMATCH.md) | source coverage | integrity | false |
| [SOURCE_COVERAGE_INPUT_KIND_INVALID](./SOURCE_COVERAGE_INPUT_KIND_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_INTENT_URIS_INVALID](./SOURCE_COVERAGE_INTENT_URIS_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_MARKDOWN_PATH_INVALID](./SOURCE_COVERAGE_MARKDOWN_PATH_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_MEDIA_TYPE_INVALID](./SOURCE_COVERAGE_MEDIA_TYPE_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_NON_MATERIALIZED_RESOURCE_URI_PRESENT](./SOURCE_COVERAGE_NON_MATERIALIZED_RESOURCE_URI_PRESENT.md) | source coverage | state | false |
| [SOURCE_COVERAGE_PATH_DUPLICATE](./SOURCE_COVERAGE_PATH_DUPLICATE.md) | source coverage | integrity | false |
| [SOURCE_COVERAGE_PATH_ESCAPE](./SOURCE_COVERAGE_PATH_ESCAPE.md) | source coverage | state | false |
| [SOURCE_COVERAGE_PATH_INVALID](./SOURCE_COVERAGE_PATH_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_PATH_ORDER_INVALID](./SOURCE_COVERAGE_PATH_ORDER_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_READ_FAILED](./SOURCE_COVERAGE_READ_FAILED.md) | source coverage | state | false |
| [SOURCE_COVERAGE_REASON_CODE_INVALID](./SOURCE_COVERAGE_REASON_CODE_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_RECORD_SHAPE_INVALID](./SOURCE_COVERAGE_RECORD_SHAPE_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_RECORDS_INVALID](./SOURCE_COVERAGE_RECORDS_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_RESOURCE_URI_HASH_MISMATCH](./SOURCE_COVERAGE_RESOURCE_URI_HASH_MISMATCH.md) | source coverage | integrity | false |
| [SOURCE_COVERAGE_ROOT_READ_FAILED](./SOURCE_COVERAGE_ROOT_READ_FAILED.md) | source coverage | state | false |
| [SOURCE_COVERAGE_SCHEMA_INVALID](./SOURCE_COVERAGE_SCHEMA_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_SNAPSHOT_HASH_INVALID](./SOURCE_COVERAGE_SNAPSHOT_HASH_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_SOURCE_HASH_INVALID](./SOURCE_COVERAGE_SOURCE_HASH_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_STATE_COUNT_MISMATCH](./SOURCE_COVERAGE_STATE_COUNT_MISMATCH.md) | source coverage | integrity | false |
| [SOURCE_COVERAGE_STATE_COUNTS_SHAPE_INVALID](./SOURCE_COVERAGE_STATE_COUNTS_SHAPE_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_STATE_INVALID](./SOURCE_COVERAGE_STATE_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_SUMMARY_SHAPE_INVALID](./SOURCE_COVERAGE_SUMMARY_SHAPE_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_TERMINAL_COUNT_MISMATCH](./SOURCE_COVERAGE_TERMINAL_COUNT_MISMATCH.md) | source coverage | integrity | false |
| [SOURCE_COVERAGE_TERMINAL_MISMATCH](./SOURCE_COVERAGE_TERMINAL_MISMATCH.md) | source coverage | integrity | false |
| [SOURCE_COVERAGE_TREE_REFS_INVALID](./SOURCE_COVERAGE_TREE_REFS_INVALID.md) | source coverage | configuration | false |
| [SOURCE_COVERAGE_TWIN_REVISION_STATUS_INVALID](./SOURCE_COVERAGE_TWIN_REVISION_STATUS_INVALID.md) | source coverage | configuration | false |
| [SOURCE_NOT_FOUND](./SOURCE_NOT_FOUND.md) | source | configuration | false |
| [SPEC_BLUEPRINT_MISSING](./SPEC_BLUEPRINT_MISSING.md) | spec | configuration | false |
| [SPEC_DSL_DIR_MISSING](./SPEC_DSL_DIR_MISSING.md) | spec | configuration | false |
| [SPEC_INTENT_CORRUPTION_DETECTED](./SPEC_INTENT_CORRUPTION_DETECTED.md) | spec | state | false |
| [SPEC_INTENT_INDEX_MISSING](./SPEC_INTENT_INDEX_MISSING.md) | spec | configuration | false |
| [SPEC_INTENT_PACK_INVALID](./SPEC_INTENT_PACK_INVALID.md) | spec | configuration | false |
| [SPEC_INTENT_PACK_MISSING](./SPEC_INTENT_PACK_MISSING.md) | spec | configuration | false |
| [SPEC_INTENT_PAGE_COVERAGE_MISSING](./SPEC_INTENT_PAGE_COVERAGE_MISSING.md) | spec | configuration | false |
| [SPEC_INTENT_PRIORITY_MISSING](./SPEC_INTENT_PRIORITY_MISSING.md) | spec | configuration | false |
| [SPEC_INTENT_PROVENANCE_INVALID](./SPEC_INTENT_PROVENANCE_INVALID.md) | spec | configuration | false |
| [SPEC_INTENT_SOURCE_HASH_MISMATCH](./SPEC_INTENT_SOURCE_HASH_MISMATCH.md) | spec | integrity | false |
| [SPEC_MARKDOWN_CONTENT_HASH_MISMATCH](./SPEC_MARKDOWN_CONTENT_HASH_MISMATCH.md) | spec | integrity | false |
| [SPEC_MARKDOWN_DIAGRAM_COUNT_MISMATCH](./SPEC_MARKDOWN_DIAGRAM_COUNT_MISMATCH.md) | spec | integrity | false |
| [SPEC_MARKDOWN_DIAGRAM_SYNTAX_INVALID](./SPEC_MARKDOWN_DIAGRAM_SYNTAX_INVALID.md) | spec | configuration | false |
| [SPEC_MARKDOWN_DIAGRAM_TARGET_MISSING](./SPEC_MARKDOWN_DIAGRAM_TARGET_MISSING.md) | spec | configuration | false |
| [SPEC_MARKDOWN_DIR_MISSING](./SPEC_MARKDOWN_DIR_MISSING.md) | spec | configuration | false |
| [SPEC_MARKDOWN_MISSING](./SPEC_MARKDOWN_MISSING.md) | spec | configuration | false |
| [SPEC_MARKDOWN_PAGE_COVERAGE_MISMATCH](./SPEC_MARKDOWN_PAGE_COVERAGE_MISMATCH.md) | spec | integrity | false |
| [SPEC_MARKDOWN_QUALITY_DEGRADED](./SPEC_MARKDOWN_QUALITY_DEGRADED.md) | spec | state | false |
| [SPEC_MARKDOWN_QUALITY_FAILED](./SPEC_MARKDOWN_QUALITY_FAILED.md) | spec | state | false |
| [SPEC_MARKDOWN_QUALITY_FALSE_PASS](./SPEC_MARKDOWN_QUALITY_FALSE_PASS.md) | spec | state | false |
| [SPEC_MARKDOWN_QUALITY_MISSING](./SPEC_MARKDOWN_QUALITY_MISSING.md) | spec | configuration | false |
| [SPEC_MARKDOWN_SOURCE_HASH_MISMATCH](./SPEC_MARKDOWN_SOURCE_HASH_MISMATCH.md) | spec | integrity | false |
| [SPEC_MARKDOWN_STRUCTURE_MISSING](./SPEC_MARKDOWN_STRUCTURE_MISSING.md) | spec | configuration | false |
| [SPEC_SCENE_MISSING](./SPEC_SCENE_MISSING.md) | spec | configuration | false |
| [SPEC_SOURCE_DIR_MISSING](./SPEC_SOURCE_DIR_MISSING.md) | spec | configuration | false |
| [SPEC_SOURCE_DOCUMENT_MISSING](./SPEC_SOURCE_DOCUMENT_MISSING.md) | spec | configuration | false |
| [SPEC_TWIN_ARTIFACT_INVALID](./SPEC_TWIN_ARTIFACT_INVALID.md) | spec | configuration | false |
| [SPEC_TWIN_BINDING_MISSING](./SPEC_TWIN_BINDING_MISSING.md) | spec | configuration | false |
| [SPEC_TWIN_BLUEPRINT_INVALID](./SPEC_TWIN_BLUEPRINT_INVALID.md) | spec | configuration | false |
| [SPEC_TWIN_COMPONENT_BASELINE_REDUCED](./SPEC_TWIN_COMPONENT_BASELINE_REDUCED.md) | spec | state | false |
| [SPEC_TWIN_MISSING](./SPEC_TWIN_MISSING.md) | spec | configuration | false |
| [SPEC_TWIN_REQUIREMENT_UNMAPPED](./SPEC_TWIN_REQUIREMENT_UNMAPPED.md) | spec | state | false |
| [T2C_INTENT_ARRAY_REQUIRED](./T2C_INTENT_ARRAY_REQUIRED.md) | t2c | configuration | false |
| [T2C_INTENT_ID_DUPLICATE](./T2C_INTENT_ID_DUPLICATE.md) | t2c | integrity | false |
| [TODO2CODE_APPROVAL_HASH_REQUIRED](./TODO2CODE_APPROVAL_HASH_REQUIRED.md) | todo2code | policy | false |
| [TODO2CODE_EXIT](./TODO2CODE_EXIT.md) | todo2code | availability | true |
| [TODO2CODE_NOT_AVAILABLE](./TODO2CODE_NOT_AVAILABLE.md) | todo2code | availability | true |
| [TREE_HEADER_REQUIRED](./TREE_HEADER_REQUIRED.md) | tree | configuration | false |
| [TWIN_CHILDREN_ARRAY_REQUIRED](./TWIN_CHILDREN_ARRAY_REQUIRED.md) | twin | configuration | false |
| [TWIN_COMPONENT_DUPLICATE](./TWIN_COMPONENT_DUPLICATE.md) | twin | integrity | false |
| [TWIN_COMPONENT_INVALID](./TWIN_COMPONENT_INVALID.md) | twin | configuration | false |
| [TWIN_COMPONENT_SOURCE_REQUIRED](./TWIN_COMPONENT_SOURCE_REQUIRED.md) | twin | configuration | false |
| [TWIN_ID_OVERRIDE](./TWIN_ID_OVERRIDE.md) | twin | state | false |
| [TWIN_KIND_OVERRIDE](./TWIN_KIND_OVERRIDE.md) | twin | state | false |
| [TWIN_PROBES_EXIT](./TWIN_PROBES_EXIT.md) | twin probes | availability | true |
| [TWIN_PROBES_NOT_AVAILABLE](./TWIN_PROBES_NOT_AVAILABLE.md) | twin probes | availability | true |
| [TWIN_REQUIRED_COMPONENT_MISSING](./TWIN_REQUIRED_COMPONENT_MISSING.md) | twin | configuration | false |
| [TWIN_REVISION_STALE](./TWIN_REVISION_STALE.md) | twin | state | false |
| [TWIN_SNAPSHOT_REQUIRED](./TWIN_SNAPSHOT_REQUIRED.md) | twin | configuration | false |
| [TWIN_SOURCE_SNAPSHOT_OVERRIDE](./TWIN_SOURCE_SNAPSHOT_OVERRIDE.md) | twin | state | false |
| [TWIN_SOURCE_URI_NOT_GROUNDED](./TWIN_SOURCE_URI_NOT_GROUNDED.md) | twin | integrity | false |
| [TWIN_STATE_EVALUATED_AT_INVALID](./TWIN_STATE_EVALUATED_AT_INVALID.md) | twin | configuration | false |
| [TWIN_STATE_PROJECTED_AT_INVALID](./TWIN_STATE_PROJECTED_AT_INVALID.md) | twin | configuration | false |
| [UNKNOWN_COMPONENT](./UNKNOWN_COMPONENT.md) | unknown | state | false |
| [UNKNOWN_DQL_KEY](./UNKNOWN_DQL_KEY.md) | unknown | state | false |
| [VENDORED_RUNTIME_ARGUMENT_REQUIRED](./VENDORED_RUNTIME_ARGUMENT_REQUIRED.md) | vendored | configuration | false |
| [VENDORED_RUNTIME_IDENTITY_MISMATCH](./VENDORED_RUNTIME_IDENTITY_MISMATCH.md) | vendored | integrity | false |
| [WATCH_ALREADY_STARTED](./WATCH_ALREADY_STARTED.md) | watch | state | true |
| [WATCH_BUILD_ALREADY_RUNNING](./WATCH_BUILD_ALREADY_RUNNING.md) | watch | state | true |
| [WEAKER_THAN_EXISTING](./WEAKER_THAN_EXISTING.md) | weaker | state | false |
| [WRONG_EXPECTED_VERSION](./WRONG_EXPECTED_VERSION.md) | wrong | state | false |
