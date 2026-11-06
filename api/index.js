'use strict';
// Vercel: барлық /api/* сұраныстары осында келеді (vercel.json → rewrites)
module.exports = require('../lib/app').handle;
