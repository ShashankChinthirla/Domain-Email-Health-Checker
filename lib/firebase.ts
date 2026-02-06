
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyDOS2cAFZs7_eyU-9oqVWU2So6TIU8kQrk",
    authDomain: "healthcheck-5d20d.firebaseapp.com",
    projectId: "healthcheck-5d20d",
    storageBucket: "healthcheck-5d20d.firebasestorage.app",
    messagingSenderId: "754893248374",
    appId: "1:754893248374:web:596cc725109b131c7c0c57"
};

// Initialize Firebase (Singleton pattern for Next.js)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let analytics: any = null;
if (typeof window !== "undefined") {
    isSupported().then((supported) => {
        if (supported) {
            analytics = getAnalytics(app);
        }
    });
}

export { app, auth, db, analytics };
