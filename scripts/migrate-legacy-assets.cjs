#!/usr/bin/env node

// Backward-compatible entry point. The content-aware migration is the only
// supported implementation so older runbooks cannot recreate legacy/ keys or
// /api/files references for public article assets.
require('./migrate-content-assets-to-s3.cjs');
