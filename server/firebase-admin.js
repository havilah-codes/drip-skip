"use strict";

const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp();

// Uses Application Default Credentials. Locally, set GOOGLE_APPLICATION_CREDENTIALS
// to an untracked Firebase service-account JSON file.
const adminAuth = getAuth(app);

module.exports = { adminAuth };
