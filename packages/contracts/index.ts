/**
 * @fieldverse/contracts — the single source of truth for the FieldVerse API and the
 * analysis contract shared with the AI/ML team's Python FastAPI service.
 *
 * analysis/  → contract between Express and ANY analysis provider (demo or remote ML)
 * api/       → contract between the React app and Express
 */
export * from './analysis/common';
export * from './analysis/environment';
export * from './analysis/requests';
export * from './analysis/responses';
export * from './api/schemas';
export * from './api/community';
