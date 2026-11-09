# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-11-09

### Fixed

- Deleting a language now removes its suggestions, dismissals and run summaries.

## [1.0.0] - 2026-11-01

The initial public release of the AI Translation plugin.

### Added

- AI-assisted translation suggestions for schema data, generated and reviewed before anything is written.
- AI-assisted translation suggestions for UI strings, behind a permission separate from the data suggestions.
- Bulk suggestion runs that appear as observable Core task types in the task list, with progress and history.
- Suggestions kept in the plugin's own table, so manual data and UI translation keeps working with the plugin disabled.

**Compatibility:** plugin version 1.0.0 requires IndraMesh Core 1.0.0.
It declares `api_version` 1.0.0.
