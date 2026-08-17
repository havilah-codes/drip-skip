"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

async function setRoleCustomClaim() {
  let nextPageToken;

  do {
    const result = await getAuth().listUsers(
      1000,
      nextPageToken
    );

    nextPageToken = result.pageToken;

    for (const user of result.users) {
      try {
        const existingClaims = user.customClaims || {};

        await getAuth().setCustomUserClaims(
          user.uid,
          {
            ...existingClaims,
            role: "authenticated",
          }
        );

        console.log(
          `✅ Updated: ${user.uid}`
        );
      } catch (error) {
        console.error(
          `❌ Failed: ${user.uid}`,
          error
        );
      }
    }
  } while (nextPageToken);

  console.log(
    "🎉 Finished updating Firebase users."
  );
}

setRoleCustomClaim()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      "❌ SCRIPT FAILED:",
      error
    );

    process.exit(1);
  });