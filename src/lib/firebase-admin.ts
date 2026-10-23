
import "server-only";

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: applicationDefault(),
        projectId: "tv-digital-2442d",
        databaseURL:
          "https://tv-digital-2442d-default-rtdb.firebaseio.com",
      });

export const adminAuth = getAuth(app);
export const adminDb = getDatabase(app);
