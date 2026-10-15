'use client';

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Config web de Firebase. Los valores son públicos (no son secretos), pero se leen de
// variables de entorno `NEXT_PUBLIC_FIREBASE_*` para poder cambiar de proyecto por entorno,
// con fallback a los valores actuales para no romper el desarrollo local. Ver `.env.example`.
// Proyecto canónico: `studio-4462619429-470d8`, el mismo de `.firebaserc` (TECH_DEBT B3, resuelto).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyALMrOQqW8MUX0Ube0HX4HOwDJgWKj_Rtg",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "studio-4462619429-470d8.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "studio-4462619429-470d8",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "studio-4462619429-470d8.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "1098477758552",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:1098477758552:web:99dc337c8c986b4c7fc22d",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
