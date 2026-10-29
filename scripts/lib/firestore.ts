import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Firestore (Admin SDK) para los scripts de terminal. Credenciales, en este orden:
 *  1. `FIREBASE_SERVICE_ACCOUNT` (JSON del service account en la variable),
 *  2. `firebase-admin-key.json` en la raíz del repo (nunca se commitea),
 *  3. Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`).
 *
 * Antes cada script copiaba su propia inicialización. El script debe cargar `./load-env` (o
 * dotenv) antes de llamar a esto.
 */
export function scriptFirestore(): Firestore {
  if (!getApps().length) {
    const keyPath = join(process.cwd(), "firebase-admin-key.json");
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    else if (existsSync(keyPath)) credential = cert(JSON.parse(readFileSync(keyPath, "utf-8")));
    else credential = applicationDefault();
    initializeApp({ credential });
  }
  return getFirestore();
}
